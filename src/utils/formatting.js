// src/utils/formatting.js

export const formatPhoneNumber = (value) => {
  const onlyNumbers = value.replace(/[^0-9]/g, "");
  let result = "";

  if (onlyNumbers.startsWith("02")) {
    if (onlyNumbers.length <= 2) result = onlyNumbers;
    else if (onlyNumbers.length <= 5) result = `${onlyNumbers.slice(0, 2)}-${onlyNumbers.slice(2)}`;
    else if (onlyNumbers.length <= 9) result = `${onlyNumbers.slice(0, 2)}-${onlyNumbers.slice(2, 5)}-${onlyNumbers.slice(5)}`;
    else result = `${onlyNumbers.slice(0, 2)}-${onlyNumbers.slice(2, 6)}-${onlyNumbers.slice(6, 10)}`;
  } else {
    if (onlyNumbers.length <= 3) result = onlyNumbers;
    else if (onlyNumbers.length <= 7) result = `${onlyNumbers.slice(0, 3)}-${onlyNumbers.slice(3)}`;
    else if (onlyNumbers.length <= 11) result = `${onlyNumbers.slice(0, 3)}-${onlyNumbers.slice(3, 7)}-${onlyNumbers.slice(7)}`;
    else result = `${onlyNumbers.slice(0, 3)}-${onlyNumbers.slice(3, 7)}-${onlyNumbers.slice(7, 11)}`;
  }

  return result;
};
