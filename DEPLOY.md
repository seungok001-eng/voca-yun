# 인터넷 배포 가이드 (Vercel + Supabase)

이미 쓰고 계신 Supabase(PostgreSQL)에 연결해 배포하는 방법입니다.

## 1. Supabase 연결 문자열 2개 복사

1. https://supabase.com 대시보드 → 사용할 프로젝트 선택 (기존 프로젝트 사용 가능)
2. 상단 **Connect** 버튼 클릭 → **ORMs** 또는 **Connection string** 탭
3. 두 가지를 복사해 메모장에 붙여둡니다. `[YOUR-PASSWORD]` 부분은 실제 DB 비밀번호로 바꿔야 합니다:
   - **Transaction pooler** (포트 **6543**) → 끝에 **`?pgbouncer=true`** 를 붙여서 → `DATABASE_URL` 용
   - **Session pooler** (포트 **5432**) → `DIRECT_URL` 용

> 예시
> - DATABASE_URL: `postgresql://postgres.abcd:비번@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
> - DIRECT_URL:  `postgresql://postgres.abcd:비번@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`

## 2. Vercel에 올리기

1. https://vercel.com → 로그인 → **Add New… → Project**
2. GitHub 저장소 **seungok001-eng/yun** 를 **Import**
3. **Root Directory**를 `vocab-app` 으로 지정 (중요!)
4. **Environment Variables**에 4개 추가:
   | 이름 | 값 |
   |---|---|
   | `DATABASE_URL` | 1단계의 Transaction pooler (6543, `?pgbouncer=true` 포함) |
   | `DIRECT_URL` | 1단계의 Session pooler (5432) |
   | `AUTH_SECRET` | 아무 긴 무작위 문자열 |
   | `SETUP_KEY` | 아무 비밀 문자열 (초기설정용, 기억해두기) |
5. **Deploy** → 몇 분 후 `https://무언가.vercel.app` 주소가 나옵니다.
   - 빌드 중 자동으로 Supabase에 필요한 표(테이블)를 만듭니다.

## 3. 초기 데이터 채우기 (딱 한 번)

브라우저 주소창에:

```
https://내주소.vercel.app/api/setup?key=여기에_SETUP_KEY값
```

`"초기 설정 완료!"` 가 나오면 20단계 12,000단어 + 그림 + 데모 계정 완료.

## 4. 접속

`https://내주소.vercel.app` 로그인 (비밀번호 모두 `1234`):
- `director` 총관리자 · `teacher1` 선생님 · `student1` 학생 · `individual1` 개인

> 데이터 분리: 이 앱의 표들은 기존 데이터와 섞이지 않도록 전용 스키마 **`voca`** 안에 자동 생성됩니다.
> (기존 `public` 스키마의 데이터는 전혀 건드리지 않습니다.) 그래서 **기존 Supabase 프로젝트를 그대로 써도 안전**하고,
> 새 프로젝트를 만들 필요가 없습니다(=추가 컴퓨팅 비용 $0).
>
> 참고: Supabase 대시보드의 Table Editor에서 이 앱 표를 보려면 좌측 상단 스키마 선택을 `public` → `voca` 로 바꾸면 됩니다.
> 운영 전 데모 계정 비밀번호는 바꾸거나 삭제하세요.
