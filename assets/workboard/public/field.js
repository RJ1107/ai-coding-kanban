// Ambient background: a slow constellation that ripples when the board receives an update.
// Purely decorative. It never represents task data and stops under reduced-motion or in a hidden tab.
export function createField(canvas) {
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, nodes = [], ripples = [], frame = 0, last = 0, energy = 0;

  function resize() {
    width = canvas.width = innerWidth;
    height = canvas.height = innerHeight;
    const count = Math.round(Math.min(70, Math.max(24, width * height / 26000)));
    nodes = Array.from({length: count}, () => ({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .12,
      depth: .35 + Math.random() * .65
    }));
    draw(0);
  }

  function draw(dt) {
    ctx.clearRect(0, 0, width, height);
    const reach = Math.min(190, width / 5);
    for (const n of nodes) {
      n.x += n.vx * dt * (1 + energy * 5) * n.depth;
      n.y += n.vy * dt * (1 + energy * 5) * n.depth;
      if (n.x < -20) n.x = width + 20; else if (n.x > width + 20) n.x = -20;
      if (n.y < -20) n.y = height + 20; else if (n.y > height + 20) n.y = -20;
    }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > reach) continue;
        ctx.strokeStyle = `rgba(120,170,230,${(1 - d / reach) * (.07 + energy * .12)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    for (const n of nodes) {
      let lift = 0;
      for (const r of ripples) lift = Math.max(lift, 1 - Math.abs(Math.hypot(n.x - r.x, n.y - r.y) - r.radius) / 90);
      ctx.fillStyle = `rgba(150,200,255,${.16 * n.depth + Math.max(0, lift) * .7})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, 1 + n.depth + Math.max(0, lift) * 1.6, 0, 7); ctx.fill();
    }
    for (const r of ripples) {
      ctx.strokeStyle = `rgba(89,200,255,${Math.max(0, .22 * (1 - r.radius / r.limit))})`;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, 7); ctx.stroke();
      r.radius += dt * .42;
    }
    ripples = ripples.filter(r => r.radius < r.limit);
    energy *= .985;
  }

  function loop(now) {
    frame = requestAnimationFrame(loop);
    if (now - last < 33) return;
    draw(Math.min(60, now - last || 16));
    last = now;
  }
  function run() {
    cancelAnimationFrame(frame);
    if (!still.matches && !document.hidden) { last = 0; frame = requestAnimationFrame(loop); }
  }

  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', run);
  still.addEventListener('change', run);
  resize(); run();

  return {
    // Start a ripple at a viewport point, e.g. where a card just landed.
    pulse(x = width * .7, y = height * .3) {
      if (still.matches) return;
      energy = 1;
      ripples.push({x, y, radius: 0, limit: Math.max(width, height) * .75});
    }
  };
}
