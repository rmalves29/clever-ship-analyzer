import { useEffect, useRef, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import { scaleSequential } from 'd3-scale';
import { interpolateYlOrRd } from 'd3-scale-chromatic';

interface LiveGlobeProps {
  markers: any[];
}

export default function LiveGlobe({ markers }: LiveGlobeProps) {
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  const globeData = useMemo(() => {
    return markers.map(m => ({
      lat: m.coordinates[1],
      lng: m.coordinates[0],
      size: m.type === 'order' ? 0.8 : 0.4,
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
      const globe = globeRef.current;
      
      // Auto-rotação suave
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.5;
      globe.controls().enableZoom = true;
      
      // Focar na América do Sul inicialmente (foco no Brasil)
      globe.pointOfView({ lat: -15, lng: -55, altitude: 2 }, 1000);
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-transparent rounded-xl">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        showGraticules={true}
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
        labelColor={() => 'rgba(255, 255, 255, 0.9)'}
        labelResolution={2}
        labelAltitude={0.02}
      />
    </div>
  );
}
