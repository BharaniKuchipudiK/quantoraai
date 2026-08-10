import React, { useState, useEffect } from 'react';

export default function LiveUsersMap({ isLight }) {
  // Simulate live users across the globe with coordinates
  const [activeUsers, setActiveUsers] = useState([
    { id: 1, lat: 40.7128, lng: -74.0060, city: "New York" },
    { id: 2, lat: 51.5074, lng: -0.1278, city: "London" },
    { id: 3, lat: 35.6762, lng: 139.6503, city: "Tokyo" },
    { id: 4, lat: 1.3521, lng: 103.8198, city: "Singapore" },
    { id: 5, lat: 37.7749, lng: -122.4194, city: "San Francisco" },
    { id: 6, lat: 48.8566, lng: 2.3522, city: "Paris" },
    { id: 7, lat: -33.8688, lng: 151.2093, city: "Sydney" },
    { id: 8, lat: 19.0760, lng: 72.8777, city: "Mumbai" },
    { id: 9, lat: -23.5505, lng: -46.6333, city: "Sao Paulo" }
  ]);

  // Rotate users dynamically to simulate live traffic
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveUsers(prev => {
        const newUsers = [...prev];
        // Randomly tweak the first user to simulate movement/new login
        newUsers[0] = {
          ...newUsers[0],
          lat: newUsers[0].lat + (Math.random() - 0.5) * 5,
          lng: newUsers[0].lng + (Math.random() - 0.5) * 5,
        };
        return newUsers;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Convert Lat/Lng to percentages for an equirectangular map projection
  const getCoordinates = (lat, lng) => {
    const x = (lng + 180) * (100 / 360);
    const y = (90 - lat) * (100 / 180);
    return { left: `${x}%`, top: `${y}%` };
  };

  // Base colors
  const bgColor = isLight ? '#ffffff' : '#0a0d1a';
  const textColor = isLight ? '#0f172a' : '#ffffff';
  
  // Create a stunning red map filter
  const mapFilter = isLight 
    ? 'invert(0.5) sepia(1) saturate(5) hue-rotate(320deg) opacity(0.3)' 
    : 'invert(1) sepia(1) saturate(5) hue-rotate(320deg) brightness(0.6) opacity(0.6)';

  return (
    <div style={{
      background: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.4)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(249, 115, 22, 0.15)',
      borderRadius: '24px',
      padding: '24px',
      boxShadow: isLight ? '0 8px 32px rgba(0,0,0,0.05)' : '0 8px 32px rgba(0,0,0,0.3)',
      animation: 'fadeIn 0.5s ease-out',
      overflow: 'hidden',
      marginTop: '24px'
    }}>
      <h3 style={{ 
        fontSize: '1.2rem', 
        fontWeight: '700', 
        marginBottom: '20px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '10px',
        color: textColor 
      }}>
        <span style={{ 
          display: 'inline-block', 
          width: '8px', 
          height: '8px', 
          borderRadius: '50%', 
          background: '#ef4444', 
          boxShadow: '0 0 12px #ef4444',
          animation: 'mapPing 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'
        }} />
        Live User Analytics
      </h3>
      
      {/* Map Container */}
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        height: '400px', 
        backgroundColor: bgColor, 
        borderRadius: '16px', 
        overflow: 'hidden',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Abstract World Map Background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: mapFilter,
          transition: 'all 0.5s ease'
        }} />
        
        {/* Heartbeat Pins */}
        {activeUsers.map(user => (
          <div key={user.id} style={{
            position: 'absolute',
            ...getCoordinates(user.lat, user.lng),
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'top 1s ease, left 1s ease'
          }}>
            <div style={{ 
              position: 'absolute', 
              width: '32px', 
              height: '32px', 
              borderRadius: '50%', 
              background: 'rgba(239, 68, 68, 0.3)', 
              animation: 'mapPing 2s cubic-bezier(0, 0, 0.2, 1) infinite',
              animationDelay: `${user.id * 0.2}s`
            }} />
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: '#ef4444', 
              boxShadow: '0 0 12px 2px rgba(239, 68, 68, 0.8)', 
              zIndex: 2 
            }} />
          </div>
        ))}

        {/* HUD Overlay Text */}
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          fontSize: '0.75rem',
          fontWeight: '700',
          letterSpacing: '0.05em'
        }}>
          GLOBAL TRAFFIC: ACTIVE
        </div>
      </div>
      
      <style>{`
        @keyframes mapPing {
          75%, 100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
