// MoveoutFormMobile.js 내 스타일 useEffect 수정
useEffect(() => {
  const style = document.createElement("style");
  style.innerHTML = `
    @media (max-width: 768px) {
      .form-inner .grid,
      .form-container .grid {
        display: grid !important;
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 12px !important;
      }

      .input-group {
        margin-bottom: 10px !important;
      }

      .input-group label {
        font-size: 14px !important;
      }

      .input-group input,
      .input-group select {
        font-size: 14px !important;
        padding: 6px !important;
      }
    }
  `;
  document.head.appendChild(style);
  return () => {
    document.head.removeChild(style);
  };
}, []);
