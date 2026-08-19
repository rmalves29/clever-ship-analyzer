import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';

let Globe: any = () => null;

interface LiveGlobeProps {
  markers: any[];
}

// Globo claro com oceano suave — o continente entra por cima via hexPolygonsData
// (pontilhado hexagonal), copiando o visual do Live View da própria Shopify.
const OCEAN_MATERIAL = new THREE.MeshPhongMaterial({
  color: '#eaf5fb',
  emissive: '#dbeefc',
  emissiveIntensity: 0.35,
  shininess: 15,
});

// Mesmo dataset usado nos exemplos oficiais da three-globe (Natural Earth 110m).
const COUNTRIES_GEOJSON_URL =
  'https://raw.githubusercontent.com/vasturiano/three-globe/master/example/country-polygons/ne_110m_admin_0_countries.geojson';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Latitude média (aproximada) dos pontos da geometria — só pra escolher a cor do país
// no degradê, não precisa de precisão geográfica de verdade.
function featureCentroidLat(feature: any): number {
  const coords: number[][] = [];
  const flatten = (arr: any): void => {
    if (!Array.isArray(arr)) return;
    if (typeof arr[0] === 'number') {
      coords.push(arr);
      return;
    }
    arr.forEach(flatten);
  };
  flatten(feature?.geometry?.coordinates);
  if (coords.length === 0) return 0;
  return coords.reduce((sum, c) => sum + (c[1] ?? 0), 0) / coords.length;
}

// Degradê azul (equador) → verde-água (polos), igual ao globo da Shopify.
function hexColorForLat(lat: number): string {
  const t = Math.min(1, Math.abs(lat) / 55);
  const blue: [number, number, number] = [56, 189, 248];
  const teal: [number, number, number] = [45, 212, 191];
  const r = lerp(blue[0], teal[0], t) | 0;
  const g = lerp(blue[1], teal[1], t) | 0;
  const b = lerp(blue[2], teal[2], t) | 0;
  return `rgb(${r},${g},${b})`;
}

export default function LiveGlobe({ markers }: LiveGlobeProps) {
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [countries, setCountries] = useState<any[]>([]);
  const [GlobeComponent, setGlobeComponent] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    import('react-globe.gl').then(mod => {
      setGlobeComponent(() => mod.default);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(COUNTRIES_GEOJSON_URL)
      .then((res) => res.json())
      .then((geojson) => {
        if (!cancelled) setCountries(geojson.features ?? []);
      })
      .catch(() => {
        // Sem contorno de países se o fetch falhar — o globo continua funcional, só mais liso.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const colorByFeature = useMemo(() => {
    const map = new Map<any, string>();
    for (const f of countries) map.set(f, hexColorForLat(featureCentroidLat(f)));
    return map;
  }, [countries]);

  const globeData = useMemo(() => {
    return markers.map((m) => ({
      lat: m.coordinates[1],
      lng: m.coordinates[0],
      size: m.type === 'order' ? 0.5 : 0.4,
      // Pedidos em roxo, sessões/visitantes em vermelho — igual pedido do usuário.
      color: m.type === 'order' ? '#9333ea' : '#ef4444',
      label: m.name,
    }));
  }, [markers]);

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
        globeMaterial={OCEAN_MATERIAL}
        showAtmosphere={true}
        atmosphereColor="#5eead4"
        atmosphereAltitude={0.2}
        showGraticules={false}
        hexPolygonsData={countries}
        hexPolygonResolution={3}
        hexPolygonMargin={0.32}
        hexPolygonAltitude={0.006}
        hexPolygonColor={(d: any) => colorByFeature.get(d) ?? '#38bdf8'}
        pointsData={globeData}
        pointRadius="size"
        pointColor="color"
        pointAltitude={0.02}
        pointResolution={16}
        pointLabel={(d: any) => `<div style="font:12px sans-serif;color:#fff;background:rgba(15,23,42,.9);padding:4px 8px;border-radius:6px">${d.label}</div>`}
        ringsData={ringsData}
        ringColor={() => (t: number) => `rgba(147,51,234,${1 - t})`}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
      />
    </div>
  );
}
