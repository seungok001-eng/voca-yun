import * as XLSX from "xlsx";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 교재 콘텐츠 업로드용 엑셀 양식 내려받기
// 각 시트의 앞 3칸(파트·영역·레슨)으로 어느 레슨인지 찾는다. 제목 행은 자동으로 걸러진다.
export async function GET() {
  try {
    await requireSuperAdmin();

    const lessons = [
      ["파트", "영역(T=Toon World / B=Book Club)", "레슨", "레슨명", "복습단원(O)", "책(Book A/B)"],
      [1, "T", 1, "Nice to Meet You", "", ""],
      [1, "T", 8, "Review", "O", ""],
      [1, "B", 1, "The Little Seed", "", "Book A"],
      [1, "B", 5, "Rainy Day", "", "Book B"],
    ];
    const words = [
      ["파트", "영역", "레슨", "단어", "품사", "뜻(쉼표로 여러 개)", "심화(O)"],
      [1, "T", 1, "meet", "v", "만나다", ""],
      [1, "T", 1, "friend", "n", "친구", ""],
      [1, "T", 1, "introduce", "v", "소개하다", "O"],
    ];
    const sentences = [
      ["파트", "영역", "레슨", "A1", "A1뜻", "B1", "B1뜻", "A2", "A2뜻", "B2", "B2뜻"],
      [1, "T", 1, "Hi, I'm Mina.", "안녕, 나는 미나야.", "Nice to meet you.", "만나서 반가워.", "Where are you from?", "어디에서 왔어?", "I'm from Korea.", "나는 한국에서 왔어."],
      [1, "T", 1, "What's your name?", "이름이 뭐야?", "My name is Tom.", "내 이름은 톰이야.", "", "", "", ""],
    ];
    const passage = [
      ["파트", "영역", "레슨", "본문 문장 (한 줄에 한 문장)", "해석"],
      [1, "B", 1, "A little seed fell on the ground.", "작은 씨앗 하나가 땅에 떨어졌어요."],
      [1, "B", 1, "It slept all winter long.", "씨앗은 겨우내 잠을 잤어요."],
    ];
    const guide = [
      ["작성 안내"],
      ["1. 각 시트의 앞 3칸(파트·영역·레슨)으로 어느 레슨인지 찾습니다. 제목 행은 그대로 두어도 됩니다."],
      ["2. 영역: T = Toon World(말하기), B = Book Club(리딩)"],
      ["3. 문장 시트 — 4줄 대화는 A1·B1·A2·B2를 모두, 2줄 대화는 A1·B1만 채웁니다."],
      ["4. 허용 답안이 여러 개면 세로줄로 구분: I'm great. | I am great"],
      ["5. 단어 예문은 비워두세요 — 단어 난이도에 맞춰 자동으로 생성합니다."],
      ["6. 심화 칸에 O를 넣으면 심화반에서만 추가로 학습하는 단어가 됩니다."],
      ["7. 같은 레슨을 다시 올리면 그 레슨 내용만 새로 덮어씁니다."],
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), "안내");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lessons), "레슨");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(words), "단어");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sentences), "문장");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(passage), "본문");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("교재_업로드_양식.xlsx")}`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
