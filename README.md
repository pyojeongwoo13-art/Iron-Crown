# IRON CROWN — GitHub Pages + Render 완성 배포판

기존 IRON CROWN 완성판을 공개 온라인 게임 형태로 분리한 프로젝트입니다.

- `client/`: GitHub Pages에서 실행되는 React/Vite 게임 화면
- `server/`: Render에서 실행되는 Node.js API + Socket.IO 서버
- Render PostgreSQL: 계정, 장비, 강화, 골드, 레벨, XP 영구 저장
- `.github/workflows/deploy-pages.yml`: GitHub Pages 자동 배포
- `render.yaml`: Render 서버와 데이터베이스 자동 생성

게임 콘텐츠는 8개 지역, 55종 몬스터, 97종 장비, 24종 포션, 최대 Lv.75를 포함합니다. 몬스터 보상과 드랍, 상점 구매, 강화 확률은 클라이언트가 아니라 서버가 판정합니다.

## 빠른 시작

처음 배포할 때는 `DEPLOY-GUIDE-KR.md`를 순서대로 따라가세요. 소스 수정 없이도 GitHub Pages와 Render를 연결할 수 있습니다.

로컬 개발:

```bash
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run dev --prefix server
npm run dev --prefix client
```

PostgreSQL이 실행 중이어야 하며 `server/.env`의 `DATABASE_URL`을 실제 주소로 바꿔야 합니다.

## 보안 구조

- 비밀번호는 bcrypt 해시로만 저장합니다.
- 로그인 세션은 서버 서명 JWT를 사용합니다.
- 보상·드랍·강화·상점 구매는 서버에서 처리합니다.
- 일반 저장 요청은 HP, 장착, 지역, 소비된 아이템만 반영하고 클라이언트가 골드·XP·장비를 임의로 늘리는 요청은 무시합니다.
- API 요청 속도 제한과 몬스터별 보상 재요청 제한이 있습니다.
- 비밀키와 DB 주소는 Git에 넣지 않고 Render 환경 변수로 관리합니다.

## 주의

Render 무료 Web Service는 한동안 접속이 없으면 잠들어 첫 접속 시 깨어나는 데 시간이 걸릴 수 있습니다. 무료 PostgreSQL은 생성 후 30일에 만료되므로, 장기간 실제 운영하려면 Render PostgreSQL을 `basic-256mb` 이상으로 바꾸세요.
