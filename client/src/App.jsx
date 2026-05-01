import React, { useState, useEffect, useRef } from 'react';
import Login from './features/auth/Login';
import ProfPage from './features/prof/ProfPage';
import ElevePage from './features/eleve/ElevePage';
import ControlRecoveryMobileCapture from './features/eleve/controlRecovery/ControlRecoveryMobileCapture';
import SystemStatus from './features/prof/components/SystemStatus';
import AutoConsoleBugReporter from './features/shared/AutoConsoleBugReporter';
import './App.css';

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const recoveryMobileToken = String(urlParams.get('recoveryMobile') || '').trim();
  if (recoveryMobileToken) {
    return <ControlRecoveryMobileCapture token={recoveryMobileToken} />;
  }

  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSessionOverride, setIsSessionOverride] = useState(false);
  const bootIdRef = useRef(null);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const res = await fetch('/api/check-deploy');
        const data = await res.json();
        if (!bootIdRef.current) bootIdRef.current = data.bootId;
        else if (data.bootId !== bootIdRef.current) {
          setIsSyncing(true);
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch (e) {}
    };
    const timer = setInterval(checkUpdate, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const sessionOverrideRaw = sessionStorage.getItem('player_override');
    if (sessionOverrideRaw) {
      try {
        const parsed = JSON.parse(sessionOverrideRaw);
        setUser({ ...parsed, id: parsed._id || parsed.id });
        setIsSessionOverride(true);
        return;
      } catch (e) {
        sessionStorage.removeItem('player_override');
      }
    }
    const saved = localStorage.getItem('player');
    if (saved) {
        const parsed = JSON.parse(saved);
        setUser({ ...parsed, id: parsed._id || parsed.id });
    }
  }, []);

  const handleLogout = () => {
    if (isSessionOverride) {
      sessionStorage.removeItem('player_override');
      setUser(null);
      return;
    }
    localStorage.clear();
    setUser(null);
  };

  const handleBackToDev = async () => {
      try {
          const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ role: 'ADMIN', firstName: 'Jean', lastName: 'Vuillet', password: 'A' })
          });
          const data = await res.json();
          if (res.ok) {
              localStorage.setItem('player', JSON.stringify(data.user));
              window.location.reload();
          }
      } catch(e) { console.error(e); }
  };

  if (isSyncing) return <div className="sync-overlay"><h2 style={{color:'white', fontWeight:900}}>SYNCHRONISATION...</h2></div>;
  
  if (!user) return (
      <div className="app-wrapper">
          <div className="public-home">
              <SystemStatus />
              <section className="public-hero">
                  <div className="public-hero-copy">
                      <p className="public-eyebrow">Plateforme scolaire Condamine</p>
                      <h1>CondaWeb centralise les devoirs, lectures, exposes et jeux pedagogiques.</h1>
                      <p className="public-lead">
                          CondaWeb est la plateforme scolaire utilisee par les eleves et les professeurs pour suivre le travail,
                          consulter les contenus de classe, remettre les devoirs et acceder aux activites pedagogiques.
                      </p>
                      <div className="public-points" aria-label="Fonctionnalites CondaWeb">
                          <span>Devoirs et suivi</span>
                          <span>Lectures et exposes</span>
                          <span>Jeux pedagogiques</span>
                          <span>Espace professeur</span>
                      </div>
                  </div>
                  <div className="public-hero-panel">
                      <Login onLoginSuccess={setUser} />
                  </div>
              </section>
          </div>
      </div>
  );

  const isTestAccount = user.isTestAccount === true;

  return (
    <div className="app-wrapper">
      <SystemStatus />
      <AutoConsoleBugReporter user={user} />
      
      {/* BANDEAU DE SÉCURITÉ V99 (Pousse le contenu vers le bas) */}
      {isTestAccount && (
        <div className="v99-test-header">
           <span>🛠️ MODE TEST ACTIF : {user.firstName} {user.lastName}</span>
           <button className="btn-back-dev-mini" onClick={handleBackToDev}>⚡ RETOUR DÉVELOPPEUR</button>
        </div>
      )}

      {/* ROUTAGE PRINCIPAL : PROF OU ÉLÈVE UNIQUEMENT */}
      {(user.isDeveloper || user.role === 'prof' || user.role === 'admin') ? (
          <ProfPage user={user} onLogout={handleLogout} />
      ) : (
          <ElevePage user={user} onLogout={handleLogout} onBackToProf={() => setUser({ ...user, role: "prof" })} />
      )}
    </div>
  );
}

// commentaire sur une ligne