import React, { useEffect } from 'react';

interface ToastProps {
  type: 'error' | 'success';
  message: string;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ type, message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`oaerror ${type === 'error' ? 'danger' : 'success-banner'}`}>
      <div>
        <strong>{type === 'error' ? 'Application Error' : 'Success'}</strong> - {message}
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 'bold',
          marginLeft: '15px',
        }}
      >
        &times;
      </button>
    </div>
  );
};
