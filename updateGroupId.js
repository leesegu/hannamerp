// updateGroupId.js

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc
} = require("firebase/firestore");

// ✅ Firebase 설정 (자신의 Firebase 프로젝트 설정으로 교체하세요)
const firebaseConfig = {
  apiKey: "AIzaSyCPQqCufM8BHclkqy26vHsPuVyvcjuVHs0",
  authDomain: "hannam-move-calculate.firebaseapp.com",
  projectId: "hannam-move-calculate",
  storageBucket: "hannam-move-calculate.firebasestorage.app",
  messagingSenderId: "578721983901",
  appId: "1:578721983901:web:84c3ff829069cb5ecf1374",
  measurementId: "G-V8M6DR6202"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ 수정할 groupId 값 설정 (예: kico2221)
const TARGET_GROUP_ID = "kico2221";

async function updateAllGroupIds() {
  const snapshot = await getDocs(collection(db, "moveoutData"));
  const updates = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    // groupId가 없거나 잘못된 경우만 업데이트
    if (!data.groupId || data.groupId !== TARGET_GROUP_ID) {
      const ref = doc(db, "moveoutData", docSnap.id);
      updates.push(updateDoc(ref, { groupId: TARGET_GROUP_ID }));
    }
  });

  await Promise.all(updates);
  console.log(`✅ ${updates.length}개 문서를 groupId='${TARGET_GROUP_ID}'로 업데이트 완료했습니다.`);
}

updateAllGroupIds().catch(console.error);
