import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PairwiseCompare from './PairwiseCompare';
import { BinarySorter } from '../utils/sorter';
import { sha256 } from '../utils/hash';
import '../App.css';

/**
 * Renders a sequence of slides for a forced-choice IQA (Image Quality Assessment) survey,
 * supporting comparison, form, and informational slides with progress tracking, timing,
 * and response collection.
 *
 * @component
 * @param {Object} props
 * @param {Array<Object>} props.slides - Array of slide objects to render. Each slide can be of type 'compare', 'form', or contain informational content.
 * @param {React.ReactNode} props.footer - Footer content to display on each slide.
 * @param {Function} props.onComplete - Callback invoked when all slides are completed. Receives the final survey result object.
 * @param {Function} props.onStart - Callback invoked once at the start of the first real comparison slide. Receives current responses.
 *
 * @returns {JSX.Element} The rendered slide sequence UI.
 */
export default function SlideRenderer({
  slides,
  footer,
  onComplete,
  onStart,
}) {

  // State management
  // idx: current slide index
  // pair: current image pair for comparison
  // displayPair: randomized order of the current pair
  // filterStyles: styles for brightness normalization
  // sorterRef: reference to the BinarySorter instance
  // responses: collected responses from the user
  // description: optional description for the current comparison
  // startedRef: tracks if the survey has started
  const [idx, setIdx] = useState(0);
  const [pair, setPair] = useState(null);
  const [displayPair, setDisplayPair] = useState(null);
  const [filterStyles, setFilterStyles] = useState(null);
  const sorterRef = useRef(null);
  const [responses, setResponses] = useState({});
  const [description, setDescription] = useState('');
  const startedRef = useRef(false);

  // canProceed: whether the user can proceed to the next slide
  // timerProgress: progress of the current timer (0 to 1)
  // blink: whether to apply a blinking effect on the Next button
  const [canProceed, setCanProceed] = useState(true);
  const [timerProgress, setTimerProgress] = useState(1);
  const [blink, setBlink] = useState(false);

  // Refs for tracking survey start time, trial start time, comparison log, rankings, and completion status
  // surveyStartRef: time when the survey started
  // trialStartRef: time when the current comparison trial started
  // comparisonLogRef: log of all comparisons made
  // rankingsRef: rankings of images per scene
  // completedRef: whether the survey has been completed
  const surveyStartRef = useRef(Date.now());
  const trialStartRef = useRef(0);
  const comparisonLogRef = useRef([]);
  const rankingsRef = useRef({});
  const completedRef = useRef(false);

  // current: memoized current slide object based on idx
  const curr = useMemo(() => slides[idx] || {}, [slides, idx]);

  // 0) INITIALIZE
  useEffect(() => {
    const secs = curr.timer;
    if (!secs) {
      setCanProceed(true);
      setTimerProgress(1);
      return;
    }
    setCanProceed(false);
    setTimerProgress(0);
    const start = Date.now();
    let raf, to;
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const prog = Math.min(elapsed / secs, 1);
      setTimerProgress(prog);
      if (prog < 1) raf = requestAnimationFrame(tick);
      else {
        setCanProceed(true);
        setBlink(true);
        to = setTimeout(() => setBlink(false), 500);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(to);
    };
  }, [idx, curr.timer]);

  // 1) INITIALIZE RESPONSES
  useEffect(() => {
    if (curr.type === 'form' && Array.isArray(curr.fields)) {
      const today = new Date().toISOString().slice(0, 10);
      const updates = {};
      curr.fields.forEach(f => {
        if (f.type === 'date' && f.defaultToday && !responses[f.name]) {
          updates[f.name] = today;
        }
      });
      if (Object.keys(updates).length) {
        setResponses(prev => ({ ...prev, ...updates }));
      }
    }
  }, [idx, curr, responses]);

  // 2) RANDOMIZE DISPLAY ORDER
  useEffect(() => {
    if (!pair) setDisplayPair(null);
    else setDisplayPair(Math.random() < 0.5 ? pair : [pair[1], pair[0]]);
  }, [pair]);

  // 2.5) NORMALIZE BRIGHTNESS
  // This effect computes brightness normalization for the current image pair
  // by calculating the mean brightness of each image and adjusting their styles.
  // It skips normalization for specific scenes that are known to have special requirements.
  useEffect(() => {
    if (!displayPair) return;

    // Skip brightness normalization in special cases
    if (curr.sceneId?.startsWith('scene_5') || curr.sceneId?.startsWith('scene_6') || curr.sceneId?.startsWith('scene_7')) {
      setFilterStyles({ left: {}, right: {} });
      return;
    }

    let cancelled = false;
    (async () => {
      const [A, B] = displayPair;
      async function computeMean(url) {
        return new Promise((res, rej) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = url;
          img.onload = () => {
            const w = img.naturalWidth, h = img.naturalHeight;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, w, h).data;
            let sum = 0;
            for (let i = 0; i < data.length; i += 4) {
              sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            }
            res(sum / (w * h));
          };
          img.onerror = rej;
        });
      }
      try {
        const [meanA, meanB] = await Promise.all([
          computeMean(A.url), computeMean(B.url)
        ]);
        if (cancelled) return;
        const target = (meanA + meanB) / 2;
        const rawA = target / meanA, rawB = target / meanB;
        const clamp = x => Math.min(1.2, Math.max(0.8, x));
        setFilterStyles({
          left: { filter: `grayscale(100%) brightness(${clamp(rawA).toFixed(3)})` },
          right: { filter: `grayscale(100%) brightness(${clamp(rawB).toFixed(3)})` }
        });
      } catch {
        setFilterStyles({ left: {}, right: {} });
      }
    })();
    return () => { cancelled = true; };
  }, [displayPair, curr.sceneId]);

  // 3) INITIALIZE SORTER
  useEffect(() => {
    if (curr.type === 'compare') {
      sorterRef.current = new BinarySorter(curr.conditions);
      const first = sorterRef.current.start();
      setPair(first);
      trialStartRef.current = Date.now();
    }
  }, [idx, curr.type, curr.conditions]);

  // 3.5) START SURVEY
  // This effect triggers the onStart callback when the first comparison slide is reached.
  useEffect(() => {
    if (
      !startedRef.current &&
      curr.type === 'compare' &&
      curr.title !== 'Practice Comparison'
    ) {
      startedRef.current = true;
      onStart(responses);
    }
  }, [idx, curr, responses, onStart]);

  // 4) HANDLE CHOOSING A WINNER
  const handleChoose = chosen => {
    const now = Date.now(), sceneId = curr.sceneId;
    comparisonLogRef.current.push({
      sceneId,
      left: pair[0].name,
      right: pair[1].name,
      winner: chosen.name,
      durationMs: now - trialStartRef.current
    });
    const next = sorterRef.current.record(chosen);
    if (next) {
      setPair(next);
      trialStartRef.current = Date.now();
    } else {
      rankingsRef.current[sceneId] = sorterRef.current.sorted;
      setIdx(i => i + 1);
    }
  };

  // 5) HANDLE FORM FIELD CHANGES
  const handleFieldChange = (name, value) =>
    setResponses(prev => ({ ...prev, [name]: value }));

  const handleFormNext = async fields => {
    for (let f of fields) {
      if (f.required && !responses[f.name]) {
        return alert(`Please fill in: ${f.label}`);
      }
    }
    setIdx(i => i + 1);
  };

  // 6) FINALIZE & ANONYMIZE
  useEffect(() => {
    if (idx < slides.length || completedRef.current) return;
    (async () => {
      const anonFields = {};
      slides.forEach(sl => {
        if (sl.type === 'form') {
          sl.fields.forEach(f => {
            if (f.anonymous) anonFields[f.name] = true;
          });
        }
      });
      const safe = {}, anon = {};
      for (let [k, v] of Object.entries(responses)) {
        if (anonFields[k]) anon[k] = await sha256(String(v));
        else safe[k] = v;
      }
      const end = Date.now();
      const result = {
        responses: safe,
        anonymous: anon,
        rankings: rankingsRef.current,
        timings: {
          surveyDurationMs: end - surveyStartRef.current,
          compareDurationMs: comparisonLogRef.current.reduce((a, c) => a + c.durationMs, 0),
          timestamp: new Date(surveyStartRef.current).toISOString()
        },
        comparisons: comparisonLogRef.current
      };
      completedRef.current = true;
      onComplete(result);
    })();
  }, [idx, slides, responses, onComplete]);

  // 7) LOAD OPTIONAL DESCRIPTION
  useEffect(() => {
    if (curr.type !== 'compare') {
      setDescription('');
      return;
    }
    let canceled = false;
    fetch(`/images/${curr.sceneId}/${curr.sceneId}.txt`)
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(txt => { if (!canceled) setDescription(txt.trim()); })
      .catch(() => { if (!canceled) setDescription(''); });
    return () => { canceled = true; };
  }, [curr.sceneId, curr.type]);

  // 8) HANDLE COMPLETION
  if (idx >= slides.length) {
    return (
      <div className="slide-container">
        <motion.div
          key="thank-you"
          className="slide-box form-box"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h2>All Done!</h2>
          <p className="slide-text" style={{ whiteSpace: 'pre-line' }}>
            Thank you for completing the survey.
          </p>
          <footer className="slide-footer">{footer}</footer>
        </motion.div>
      </div>
    );
  }

  const isCompare = curr.type === 'compare';
  const prevIsCompare = idx > 0 && slides[idx - 1].type === 'compare';
  const pairKey = pair ? `${pair[0].name}__vs__${pair[1].name}` : 'empty';

  return (
    <div className="slide-container">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          className={`slide-box ${curr.type === 'form' ? 'form-box' : ''}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <div className="progress-container">
            <div
              className="progress-bar"
              style={{
                width: `${(idx / (slides.length - 1)) * 100}%`
              }}
            />
          </div>

          {curr.title && <h2 className="slide-title">{curr.title}</h2>}

          {isCompare ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={pairKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {filterStyles ? (
                  <PairwiseCompare
                    pair={displayPair}
                    onChoose={handleChoose}
                    styles={filterStyles}
                  />
                ) : (
                  <p className="info-text">Preparing next comparison…</p>
                )}
                {description && (
                  <div className="compare-description">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {description}
                    </ReactMarkdown>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          ) : curr.type === 'form' ? (
            <form className="form-slide" onSubmit={e => { e.preventDefault(); handleFormNext(curr.fields); }}>
              {curr.fields.map(f => {
                if (f.dependsOn && responses[f.dependsOn.field] !== f.dependsOn.value) {
                  return null;
                }
                return (
                  <div key={f.name} className="form-field">
                    {/* only show label if not a dependent field */}
                    {!f.dependsOn && (
                      <label htmlFor={f.name}>
                        {f.label}{f.required && <span className="required-asterisk">*</span>}
                      </label>
                    )}

                    {/* text / number / email */}
                    {(['text', 'number', 'email'].includes(f.type) && !f.dependsOn) && (
                      <input
                        id={f.name}
                        type={f.type}
                        name={f.name}
                        placeholder={f.placeholder}
                        value={responses[f.name] || ''}
                        onChange={e => handleFieldChange(f.name, e.target.value)}
                        required={!!f.required}
                        {...(f.type === 'number' && f.min != null ? { min: f.min } : {})}
                        {...(f.type === 'number' && f.max != null ? { max: f.max } : {})}
                      />
                    )}

                    {/* date */}
                    {f.type === 'date' && (
                      <input
                        id={f.name}
                        type="date"
                        name={f.name}
                        required={!!f.required}
                        value={responses[f.name] || ''}
                        onChange={e => handleFieldChange(f.name, e.target.value)}
                      />
                    )}

                    {/* dropdown/select */}
                    {f.type === 'select' && (
                      <select
                        id={f.name}
                        name={f.name}
                        value={responses[f.name] || ''}
                        onChange={e => handleFieldChange(f.name, e.target.value)}
                        required={!!f.required}
                      >
                        <option value="" disabled>— select —</option>
                        {f.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}

                    {/* dependent “Other” text input */}
                    {f.dependsOn && (
                      <input
                        id={f.name}
                        type="text"
                        name={f.name}
                        placeholder={f.placeholder}
                        value={responses[f.name] || ''}
                        onChange={e => handleFieldChange(f.name, e.target.value)}
                        required={!!f.required}
                      />
                    )}

                    {/* checkbox */}
                    {f.type === 'checkbox' && (
                      <label className="checkbox-field">
                        <input
                          id={f.name}
                          type="checkbox"
                          name={f.name}
                          checked={!!responses[f.name]}
                          onChange={e => handleFieldChange(f.name, e.target.checked)}
                          required={!!f.required}
                        />
                        <span>{f.value}</span>
                      </label>
                    )}
                  </div>
                );
              })}
              <div className="nav">
                <button type="submit" className={`btn${blink ? ' blink' : ''}`} disabled={!canProceed}>
                  {curr.timer > 0 && (
                    <span className="timer-overlay" style={{ width: `${(1 - timerProgress) * 100}%` }} />
                  )}
                  Next ►
                </button>
              </div>
            </form>
          ) : (
            curr.content?.map((block, i) => {
              if (block.type === 'text') {
                return (
                  <div key={i} className="slide-text">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {block.text}
                    </ReactMarkdown>
                  </div>
                );
              }
              if (block.type === 'images') {
                return (
                  <div key={i} className="slide-images-container">
                    {block.images.map((src, j) => (
                      <img key={j} src={src} alt="" className="slide-image-item" />
                    ))}
                  </div>
                );
              }
              if (block.type === 'image') {
                return <img key={i} src={block.image} alt="" className="slide-image" />;
              }
              return null;
            })
          )}

          {/* nav for non-form non-compare */}
          {!isCompare && curr.type !== 'form' && (
            <div className="nav">
              {idx > 0 && !prevIsCompare && (
                <button className="btn" onClick={() => setIdx(i => i - 1)} disabled={curr.timer > 0 && !canProceed}>
                  ◄ Back
                </button>
              )}
              <button className={`btn${blink ? ' blink' : ''}`} onClick={() => setIdx(i => i + 1)} disabled={!canProceed}>
                {curr.timer > 0 && (
                  <span className="timer-overlay" style={{ width: `${(1 - timerProgress) * 100}%` }} />
                )}
                {idx === slides.length - 1 ? 'Submit' : 'Next'} ►
              </button>
            </div>
          )}

          <footer className="slide-footer">{footer}</footer>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
