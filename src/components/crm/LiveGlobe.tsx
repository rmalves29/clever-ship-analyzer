import { useEffect, useRef, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';

interface LiveGlobeProps {
  markers: any[];
}

// Oceano escuro sólido — os continentes entram por cima via polygonsData (hexPolygons ficaria
// pesado demais só pra contorno). Visual final: oceano escuro + terra num azul mais claro,
// parecido com o globo da Shopify.
const OCEAN_MATERIAL = new THREE.MeshPhongMaterial({
  color: '#060a17',
  emissive: '#060a17',
  emissiveIntensity: 0.2,
  shininess: 8,
});

// Mesmo dataset (Natural Earth 110m, via three-globe) usado nos exemplos oficiais da lib —
// contorno de todos os países do mundo em GeoJSON.
const COUNTRIES_GEOJSON_URL =
  'https://raw.githubusercontent.com/vasturiano/three-globe/master/example/country-polygons/ne_110m_admin_0_countries.geojson';

export default function LiveGlobe({ markers }: LiveGlobeProps) {
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [countries, setCountries] = useState<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

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
        globeMaterial={OCEAN_MATERIAL}
        showAtmosphere={true}
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.22}
        showGraticules={false}
        polygonsData={countries}
        polygonCapColor={() => 'rgba(96, 165, 250, 0.35)'}
        polygonSideColor={() => 'rgba(15, 23, 42, 0)'}
        polygonStrokeColor={() => 'rgba(148, 197, 253, 0.55)'}
        polygonAltitude={0.006}
        pointsData={globeData}
        pointRadius="size"
        pointColor="color"
        pointAltitude={0.015}
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
