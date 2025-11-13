import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface ElectionTimerProps {
  endTime: number;
  status: 'active' | 'closed';
}

export function ElectionTimer({ endTime, status }: ElectionTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    if (status === 'closed') {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endTime, status]);

  const formatTime = (ms: number) => {
    if (ms <= 0) return '0s';

    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  };

  const isExpired = timeRemaining === 0 && status === 'active';

  return (
    <div className={`election-timer ${isExpired ? 'timer-expired' : ''}`}>
      <div className="timer-content">
        <Clock className="w-5 h-5" />
        <div className="timer-text">
          {status === 'closed' ? (
            <span className="timer-status">Election Closed</span>
          ) : isExpired ? (
            <span className="timer-status timer-expired-text">Election Expired</span>
          ) : (
            <>
              <span className="timer-label">Time Remaining:</span>
              <span className="timer-value">{formatTime(timeRemaining)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

