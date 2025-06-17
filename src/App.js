
import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import {
  doc, setDoc, getDoc,
  collection, addDoc
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { sha256 } from './utils/hash';
import SlideRenderer from './components/SlideRenderer';
import './App.css';

// derive a base ID from email or name, else random
async function deriveBaseId(responses) {
  if (responses.email) {
    return await sha256(responses.email.trim().toLowerCase());
  }
  if (responses.name) {
    return await sha256(responses.name.trim());
  }
  return uuidv4();
}

// upsert a session doc
async function writeSession(baseId, status) {
  const sessionRef = doc(db, 'sessions', baseId);
  const payload = {
    userId: baseId,
    status,
    ...(status === 'started'
      ? { timestampStart: new Date().toISOString() }
      : { timestampEnd: new Date().toISOString() })
  };
  // merge to preserve fields
  await setDoc(sessionRef, payload, { merge: true });
}

// Fisher–Yates shuffle
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Recursively clean undefined → null
function deepClean(obj) {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(deepClean);
  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, deepClean(v)])
    );
  }
  return obj;
}

// save final results, avoiding collisions
async function saveWithRetry(baseId, payload) {
  const targetRef = doc(db, 'results', baseId);
  const snap = await getDoc(targetRef);

  if (!snap.exists()) {
    await setDoc(targetRef, payload);
    return baseId;
  } else {
    const collRef = collection(db, 'results');
    const newRef = await addDoc(collRef, payload);
    return newRef.id;
  }
}

/**
 * Main application component for the IQA forced-choice survey.
 *
 * Loads survey configuration and image manifest, assembles the slide deck,
 * and manages session state and result submission.
 *
 * - Loads survey configuration and image manifest on mount or when surveyId changes.
 * - Assembles the slide deck including pre-slides, practice slides, and main comparison slides.
 * - Handles session start and completion, logging status and saving results.
 * - Renders the SlideRenderer with the assembled slides, or a loading message.
 */
export default function App() {
  const [slides, setSlides] = useState(null);
  const [footer, setFooter] = useState('');
  const [surveyId, setSurveyId] = useState('survey1');
  const [sessionId, setSessionId] = useState(null);

  // load config + manifest
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const skipCompare = params.get('skipCompare') === 'true';
    const id = params.get('survey') || 'survey1';
    setSurveyId(['survey1', 'survey2', 'survey3'].includes(id) ? id : 'survey1');

    async function init() {
      const cfgRes = await fetch(`/slides/${surveyId}.json`);
      if (!cfgRes.ok) throw new Error('Failed to load survey config');
      const cfg = await cfgRes.json();

      const manRes = await fetch('/image-manifest.json');
      if (!manRes.ok) throw new Error('Failed to load image manifest');
      const manifest = await manRes.json();

      // expand compareScenes → actual scene IDs
      const allSceneIds = Object.keys(manifest);
      const realScenes = new Set();
      (cfg.compareScenes || []).forEach(pref =>
        allSceneIds
          .filter(name => name.startsWith(pref))
          .forEach(name => realScenes.add(name))
      );
      const shuffledScenes = shuffle([...realScenes]);
      setFooter(cfg.footer);

      // assemble deck
      const deck = [...cfg.preSlides];
      if (cfg.practiceIntroSlides) deck.push(...cfg.practiceIntroSlides);
      if (cfg.practiceScenes) {
        cfg.practiceScenes.forEach(sceneId => {
          const files = manifest[sceneId] || [];
          deck.push({
            type: 'compare',
            title: 'Practice Comparison',
            sceneId,
            conditions: files.map(n => ({ name: n, url: `/images/${sceneId}/${n}` }))
          });
        });
      }
      if (cfg.practiceOutroSlides) deck.push(...cfg.practiceOutroSlides);

      shuffledScenes.forEach(sceneId => {
        const files = manifest[sceneId] || [];
        deck.push({
          type: 'compare',
          title: 'Which image has better quality?',
          sceneId,
          conditions: files.map(n => ({ name: n, url: `/images/${sceneId}/${n}` }))
        });
      });

      deck.push(...cfg.postSlides);

      setSlides(
        skipCompare
          ? deck.filter(sl => sl.type !== 'compare')
          : deck
      );
    }

    init().catch(console.error);
  }, [surveyId]);

  // Log started status
  const handleStart = async (responses) => {
    const baseId = await deriveBaseId(responses);
    setSessionId(baseId);
    try {
      await writeSession(baseId, 'started');
      console.log('Started session for:', baseId);
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  // Log submitted status
  const handleComplete = async result => {
    if (result.error === 'duplicate') return;

    // gather metadata
    const deviceInfo = {
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        colorDepth: window.screen.colorDepth
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
      platform: navigator.platform
    };

    const payload = deepClean({ surveyId, device: deviceInfo, ...result });
    const baseId = sessionId;

    try {
      await writeSession(baseId, 'completed');
      const finalId = await saveWithRetry(baseId, payload);
      console.log('Saved results under ID:', finalId);
    } catch (err) {
      console.error('Failed to save results:', err);
    }
  };

  return (
    <div className="App">
      {slides
        ? <SlideRenderer
          slides={slides}
          footer={footer}
          onStart={handleStart}
          onComplete={handleComplete}
        />
        : <p className="loading">Loading survey…</p>}
    </div>
  );
}
