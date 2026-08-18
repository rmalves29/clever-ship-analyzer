import { useEffect, useRef, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { interpolateYlOrRd } from 'd3-scale-chromatic';
import { scaleSequential } from 'd3-scale';

interface LiveGlobeProps {
  markers: any[];
}

export default function LiveGlobe({ markers }: LiveGlobeProps) {
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Cores e escalas
  const colorScale = scaleSequential(interpolateYlOrRd).domain([0, 10]);

  const globeData = useMemo(() => {
    return markers.map(m => ({
      lat: m.coordinates[1],
      lng: m.coordinates[0],
      size: m.type === 'order' ? 0.5 : 0.2,
      color: m.type === 'order' ? '#10b981' : '#3b82f6',
      label: m.name
    }));
  }, [markers]);

  const ringsData = useMemo(() => {
    return markers.filter(m => m.type === 'order').map(m => ({
      lat: m.coordinates[1],
      lng: m.coordinates[0],
      maxR: 5,
      propagationSpeed: 2,
      repeatPeriod: 1000
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
      // Configurações do globo
      const globe = globeRef.current;
      
      // Auto-rotação
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.5;
      globe.controls().enableZoom = false;
      
      // Focar na América do Sul inicialmente
      globe.pointOfView({ lat: -15, lng: -55, altitude: 2 }, 1000);
      
      // Luzes
      const directionalLight = globe.scene().children.find((obj: any) => obj.type === 'DirectionalLight');
      if (directionalLight) {
        directionalLight.intensity = 2;
      }
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-transparent">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        pointsData={globeData}
        pointRadius="size"
        pointColor="color"
        pointAltitude={0.01}
        ringsData={ringsData}
        ringColor={() => "#10b981"}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        labelsData={globeData}
        labelLat={d => (d as any).lat}
        labelLng={d => (d as any).lng}
        labelText={d => (d as any).label}
        labelSize={1.5}
        labelDotRadius={0.5}
        labelColor={() => 'rgba(255, 255, 255, 0.75)'}
        labelResolution={2}
      />
    </div>
  );
}
