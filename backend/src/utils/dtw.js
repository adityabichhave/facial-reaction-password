function dtwDistance(seqA, seqB) {
  const n = seqA.length;
  const m = seqB.length;
  const INF = 1e9;
  const dtw = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  dtw[0][0] = 0;
  function frameDist(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = frameDist(seqA[i - 1], seqB[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }
  return dtw[n][m] / (n + m);
}

module.exports = { dtwDistance };
