// src/utils/sortByTodayFirst.js
export function sortByTodayFirst(dataArray) {
  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  return dataArray.sort((a, b) => {
    const aIsToday = a.moveOutDate?.startsWith(todayStr);
    const bIsToday = b.moveOutDate?.startsWith(todayStr);

    if (aIsToday && !bIsToday) return -1;
    if (!aIsToday && bIsToday) return 1;

    return new Date(b.moveOutDate) - new Date(a.moveOutDate); // 최신순
  });
}
