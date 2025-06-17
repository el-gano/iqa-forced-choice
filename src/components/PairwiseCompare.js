/**
 * Renders a pairwise image comparison component with selectable options.
 *
 * @component
 * @param {Object} props - The component props.
 * @param {[Object, Object]} props.pair - An array containing two image objects to compare. Each image object should have `url` and `name` properties.
 * @param {Object} props.styles - An object containing style objects for the left and right images (`styles.left`, `styles.right`).
 * @param {Function} props.onChoose - Callback function invoked when an image is chosen. Receives the selected image object as an argument.
 * @returns {JSX.Element} The rendered pairwise comparison UI.
 */
export default function PairwiseCompare({ pair, styles, onChoose }) {
  if (!pair) return <p className="info-text">Preparing next comparison…</p>;
  const [left, right] = pair;
  return (
    <div className="compare-container">
      {[left, right].map((img, i) => (
        <div key={i} className="compare-block">
          <div className="img-wrapper">
            <img
              src={img.url}
              alt={img.name}
              className="compare-img"
              style={i === 0 ? styles.left : styles.right}
            />
          </div>
          <button
            className="btn compare-btn"
            onClick={() => onChoose(img)}
          >
            {i === 0 ? 'Choose Left' : 'Choose Right'}
          </button>
        </div>
      ))}
    </div>
  );
}