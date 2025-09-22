import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase"; // 기존 프로젝트의 firebase 초기화 파일
import { idToEmail } from "./idToEmail";

export async function loginWithIdEmpNoPassword({ id, employeeNo, password }) {
  const email = idToEmail(id, employeeNo);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // Auth 성공 후 본인 프로필 읽기
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      await signOut(auth);
      throw new Error("프로필이 없습니다. 관리자에게 문의해 주세요.");
    }

    const profile = snap.data();

    // 2차 검증(권장): 화면 입력과 프로필 필드 일치 확인 + 활성화 상태
    if (
      String(profile.id).toLowerCase() !== String(id).toLowerCase() ||
      String(profile.employeeNo) !== String(employeeNo) ||
      profile.isActive === false
    ) {
      await signOut(auth);
      throw new Error("아이디/사번이 일치하지 않거나 비활성화된 계정입니다.");
    }

    return { uid, profile };
  } catch (e) {
    const msg =
      e.code === "auth/invalid-credential" ||
      e.code === "auth/wrong-password" ||
      e.code === "auth/user-not-found"
        ? "아이디·사번·비밀번호가 일치하지 않습니다."
        : e.message || "로그인에 실패했습니다.";
    throw new Error(msg);
  }
}
