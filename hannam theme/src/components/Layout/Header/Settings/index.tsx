import { useState, useRef, useEffect } from "react";
import RTLMode from "./RTLMode";

export default function Settings() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref for the dropdown container
  const buttonRef = useRef<HTMLButtonElement>(null); // Ref for the settings button

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <div className="relative settings-menu mx-[8px] md:mx-[10px] lg:mx-[12px] ltr:first:ml-0 ltr:last:mr-0 rtl:first:mr-0 rtl:last:ml-0">
        <button
          ref={buttonRef}
          type="button"
          className="leading-none inline-block transition-all relative top-[2px] hover:text-primary-500"
          onClick={toggleDropdown}
        >
          <i className="material-symbols-outlined !text-[22px] md:!text-[24px]">
            settings
          </i>
        </button>

        <div
          ref={dropdownRef}
          className={`${
            isOpen ? "opacity-100 visible" : "opacity-0 invisible"
          } transition-all`}
        >
          <div className="bg-white dark:bg-[#0c1427] transition-all shadow-3xl dark:shadow-none p-[20px] absolute mt-[17px] md:mt-[20px] w-[195px] z-[1] top-full ltr:right-0 rtl:left-0 rounded-md">
            <RTLMode />
          </div>
        </div>
      </div>
    </>
  );
}
