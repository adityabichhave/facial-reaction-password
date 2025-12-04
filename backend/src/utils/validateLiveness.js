function validateLiveness(sequence) {
  // Very simple liveness heuristic: check variance across frames
  if (!Array.isArray(sequence) || sequence.length < 3) return false;
  const dims = sequence[0].length;
  const mean = new Array(dims).fill(0);
  sequence.forEach(f => {
    for (let i = 0; i < dims; i++) mean[i] += f[i];
  });
  for (let i = 0; i < dims; i++) mean[i] /= sequence.length;
  let varSum = 0;
  sequence.forEach(f => {
    for (let i = 0; i < dims; i++) {
      const d = f[i] - mean[i];
      varSum += d * d;
    }
  });
  const variance = varSum / (sequence.length * dims);
  return variance > 0.00005;
}

module.exports = { validateLiveness };
