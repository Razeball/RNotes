import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import '../styles/SplashScreen.css';

interface SplashScreenProps {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  const { t } = useTranslation();
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => {
      setFading(true);
    }, 1300);

    const doneTimer = setTimeout(() => {
      onDone();
    }, 1700);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div className={`splash-overlay ${fading ? 'splash-fade-out' : ''}`}>
      <div className="splash-content">
        <img src="icon.png" alt={t("RNotes Logo")}  className='splash-logo'/>
        <div className="splash-name">RNotes</div>
      </div>
    </div>
  );
}
