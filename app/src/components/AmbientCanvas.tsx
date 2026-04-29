import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  char: string; size: number;
}

const HEX = "0123456789abcdef";

export function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let t = 0;
    const particles: Particle[] = [];

    function resize() {
      canvas!.width  = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function spawnParticle() {
      if (particles.length > 80) return;
      const maxLife = 120 + Math.random() * 180;
      particles.push({
        x: Math.random() * canvas!.width,
        y: canvas!.height + 10,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.3 + Math.random() * 0.5),
        life: 0, maxLife,
        char: HEX[Math.floor(Math.random() * HEX.length)],
        size: 9 + Math.floor(Math.random() * 5),
      });
    }

    function noise(x: number, y: number, z: number) {
      return (
        Math.sin(x * 0.11 + y * 0.17 + z * 0.9) *
        Math.cos(x * 0.13 - y * 0.11 + z * 0.7)
      );
    }

    function draw() {
      const { width, height } = canvas!;
      t += 0.004;

      ctx.fillStyle = "rgba(5,5,10,0.22)";
      ctx.fillRect(0, 0, width, height);

      const nodes: [number, number][] = [];
      for (let i = 0; i < 20; i++) {
        const angle  = (i / 20) * Math.PI * 2 + t * 0.25;
        const radius = 200 + noise(i * 1.3, 0, t) * 90;
        nodes.push([
          width  * 0.5 + Math.cos(angle) * radius,
          height * 0.36 + Math.sin(angle) * radius * 0.38,
        ]);
      }

      ctx.lineWidth = 0.35;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
          if (d > 260) continue;
          ctx.strokeStyle = `rgba(124,58,237,${(1 - d / 260) * 0.13})`;
          ctx.beginPath();
          ctx.moveTo(nodes[i][0], nodes[i][1]);
          ctx.lineTo(nodes[j][0], nodes[j][1]);
          ctx.stroke();
        }
      }
      for (const [nx, ny] of nodes) {
        const pulse = (Math.sin(t * 2 + nx * 0.01) + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(nx, ny, 1.2 + pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(124,58,237,${0.15 + pulse * 0.25})`;
        ctx.fill();
      }

      if (Math.random() < 0.18) spawnParticle();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life++;
        if (p.life > 60 && Math.random() < 0.04)
          p.char = HEX[Math.floor(Math.random() * HEX.length)];
        const prog  = p.life / p.maxLife;
        const alpha = prog < 0.1 ? prog * 10 * 0.18
          : prog > 0.8 ? (1 - (prog - 0.8) / 0.2) * 0.18 : 0.18;
        ctx.fillStyle = `rgba(124,58,237,${alpha})`;
        ctx.font = `${p.size}px "Space Mono",monospace`;
        ctx.fillText(p.char, p.x, p.y);
        if (p.life >= p.maxLife || p.y < -20) particles.splice(i, 1);
      }

      const grd = ctx.createRadialGradient(width * 0.5, height * 0.2, 0, width * 0.5, height * 0.2, height * 0.5);
      grd.addColorStop(0,   "rgba(124,58,237,0.04)");
      grd.addColorStop(0.4, "rgba(34,211,238,0.015)");
      grd.addColorStop(1,   "transparent");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, width, height);

      const fade = ctx.createLinearGradient(0, height * 0.65, 0, height);
      fade.addColorStop(0, "transparent");
      fade.addColorStop(1, "rgba(5,5,10,0.65)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, width, height);

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }} />;
}
