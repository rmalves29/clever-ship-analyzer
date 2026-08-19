import { useEffect, useRef, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';

interface LiveGlobeProps {
  markers: any[];
}

// Material escuro sólido (navy) em vez da textura foto-realista — visual próximo do
// globo da Shopify (esfera escura + marcadores brilhando por cima, sem grade nem texto).
const DARK_GLOBE_MATERIAL = new THREE.MeshPhongMaterial({
  color: '#0b1229',
  emissive: '#0b1229',
  emissiveIntensity: 0.2,
  shininess: 12,
});

export default function LiveGlobe({ markers }: LiveGlobeProps) {
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  const globeData = useMemo(() => {
    return markers.map((m) => ({
      lat: m.coordinates[1],
      lng: m.coordinates[0],
      size: m.type === 'order' ? 0.55 : 0.35,
      color: m.type === 'order' ? '#34d399' : '#38bdf8',
      label: m.name,
    }));
  }, [markers]);

  // Só as cidades com pedido pulsam — um anel só, sutil, pra não virar bagunça visual
  // quando várias cidades estão perto umas das outras.
  const ringsData = useMemo(() => {
    return markers
      .filter((m) => m.type === 'order')
      .map((m) => ({
        lat: m.coordinates[1],
        lng: m.coordinates[0],
        maxR: 2.2,
        propagationSpeed: 1.4,
        repeatPeriod: 1800,
      }));
  }, [markers]);

  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setDimensions({ width: clientWidth, height: clientHeight });
    }

    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (globeRef.current) {
      const globe = globeRef.current;

      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.4;
      globe.controls().enableZoom = true;

      // Mais próximo do Brasil, pra separar visualmente as cidades vizinhas.
      globe.pointOfView({ lat: -16, lng: -50, altitude: 1.4 }, 1000);
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-transparent rounded-xl">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={DARK_GLOBE_MATERIAL}
        showAtmosphere={true}
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.22}
        showGraticules={false}
        pointsData={globeData}
        pointRadius="size"
        pointColor="color"
        pointAltitude={0.012}
        pointResolution={16}
        pointLabel={(d: any) => `<div style="font:12px sans-serif;color:#fff;background:rgba(15,23,42,.9);padding:4px 8px;border-radius:6px">${d.label}</div>`}
        ringsData={ringsData}
        ringColor={() => (t: number) => `rgba(52,211,153,${1 - t})`}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
      />
    </div>
  );
}
