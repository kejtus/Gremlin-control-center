/** Ukryty region dla czytników ekranu (ogłoszenia zmian). */
export function A11yLiveRegion() {
  return (
    <div
      id="rpilot-a11y-live"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    />
  );
}
