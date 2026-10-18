import React, {useEffect, useState} from 'react';
import {Download, Globe, WifiOff, RefreshCw} from 'lucide-react';
import {registerOffline} from './browser';
export default function BrowserStatus() {
  const [install, setInstall] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [waiting, setWaiting] = useState(null);
  useEffect(() => {
    const offer = event => {event.preventDefault(); setInstall(event);};
    const installed = () => setInstall(null);
    const status = () => setOnline(navigator.onLine);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    window.addEventListener('online', status);
    window.addEventListener('offline', status);
    registerOffline(setWaiting);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('online', status);
      window.removeEventListener('offline', status);
    };
  }, []);
  if (location.protocol === 'file:') return null;
  return <div className="browser-status"><div>{online ? <Globe size={17}/> : <WifiOff size={17}/>}<span><b>{online ? 'Your portfolio, in your browser' : 'You’re offline — your portfolio still works'}</b><small>Saved in this browser. Use Full backup to move devices or before clearing browsing data.</small></span></div><div className="actions">{install && <button onClick={async () => {await install.prompt(); setInstall(null);}}><Download size={14}/> Install app</button>}{waiting && <button onClick={() => {
    if (!confirm('Reload to update the app? Save any open holding edits first. Your saved portfolio will be kept.')) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once:true});
    waiting.waiting?.postMessage({type:'ACTIVATE_UPDATE'});
  }}><RefreshCw size={14}/> Update app</button>}</div></div>;
}
