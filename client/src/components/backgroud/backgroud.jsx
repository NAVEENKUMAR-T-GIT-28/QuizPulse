import LiquidEther from './LiquidEther';

export default function Background() {
  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      width: '100%', 
      height: '100%', 
      zIndex: -1, 
      pointerEvents: 'none',
      overflow: 'hidden'
    }}>
      <LiquidEther
        colors={[ '#5227FF', '#FF9FFC', '#B497CF' ]}
        mouseForce={10}
        cursorSize={80}
        isViscous
        viscous={40}
        iterationsViscous={32}
        iterationsPoisson={32}
        resolution={0.5}
        isBounce={false}
        autoDemo
        autoSpeed={0.2}
        autoIntensity={1.0}
        takeoverDuration={0.25}
        autoResumeDelay={3000}
        autoRampDuration={0.6}
        color0="#5227FF"
        color1="#FF9FFC"
        color2="#B497CF"
      />
    </div>
  );
}