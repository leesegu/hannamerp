import React from "react";
import "./ImageSlider.css";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

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
      <div className="image-slider">
        <img src={imageUrls[currentIndex]} alt={`사진 ${currentIndex + 1}`} />

        <button
          className="slider-button left"
          onClick={() =>
            setCurrentIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1))
          }
        >
          <FaChevronLeft />
        </button>

        <button
          className="slider-button right"
          onClick={() =>
            setCurrentIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1))
          }
        >
          <FaChevronRight />
        </button>
      </div>

      <div className="slider-indicators">
        <span>{currentIndex + 1} / {imageUrls.length}</span>
      </div>

      <button className="delete-button" onClick={handleDelete}>
        삭제
      </button>
    </div>
  );
}
