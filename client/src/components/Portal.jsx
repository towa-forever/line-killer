import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

export default function Portal({ children }) {
  const el = useRef(document.createElement('div'));
  useEffect(() => {
    const portal = el.current;
    document.body.appendChild(portal);
    return () => document.body.removeChild(portal);
  }, []);
  return ReactDOM.createPortal(children, el.current);
}
