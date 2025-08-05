import React from "react";
import "./ImageSlider.css";

export default function ImageSlider({ imageUrls = [], setImageUrls, isMobile }) {
  const [currentIndex, setCurrentIndex] = React.useState(0);

  if (!imageUrls.length) return null;

  const handleDelete = () => {
    const updated = [...imageUrls];
    updated.splice(currentIndex, 1);
    setImageUrls(updated);
    setCurrentIndex(0);
  };

  const sliderClass = isMobile ? "image-slider-wrapper mobile" : "image-slider-wrapper";

  return (
    <div className={sliderClass}>
      <button
        className="slider-button left"
        onClick={() =>
          setCurrentIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1))
        }
      >
        ◀
      </button>

      <div className="image-slider">
        <img src={imageUrls[currentIndex]} alt={`사진 ${currentIndex + 1}`} />
      </div>

      <button
        className="slider-button right"
        onClick={() =>
          setCurrentIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1))
        }
      >
        ▶
      </button>

      <div className="slider-indicators">
        {imageUrls.map((_, idx) => (
          <span
            key={idx}
            className={idx === currentIndex ? "active" : ""}
          >
            ●
          </span>
        ))}
      </div>

      <button className="delete-button" onClick={handleDelete}>
        삭제
      </button>
    </div>
  );
}
