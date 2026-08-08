# IRON CROWN v4 — GitHub Pages + Render 완성 배포판

기존 IRON CROWN 완성판을 공개 온라인 게임 형태로 분리한 프로젝트입니다.

- `client/`: GitHub Pages에서 실행되는 React/Vite 게임 화면
- `server/`: Render에서 실행되는 Node.js API + Socket.IO 서버
- Render PostgreSQL: 계정, 장비, 강화, 골드, 레벨, XP 영구 저장
- `.github/workflows/deploy-pages.yml`: GitHub Pages 자동 배포
- `render.yaml`: Render 서버와 데이터베이스 자동 생성

게임 콘텐츠는 8개 지역, 55종 몬스터, 97종 장비, 24종 포션, 최대 Lv.75를 포함합니다. 몬스터 보상과 드랍, 상점 구매, 강화 확률은 클라이언트가 아니라 서버가 판정합니다.

이번 보스 전면 개편판에서는 8개 지역 보스가 서로 다른 전용 패턴·페이즈·연계·후딜을 사용합니다. 보스 위치, 타겟, HP, 페이즈, 공격 판정, 기여자 보상은 Render 서버가 권위 있게 처리하며 여러 클라이언트에 같은 상태를 전송합니다. 자세한 구현표와 검증 항목은 `BOSS-COMBAT-UPDATE-KR.md`에서 확인할 수 있습니다.

v4는 v3 최적화를 유지하면서 보스 공격을 서버 공통 타임라인으로 동기화하고, 참가자별 봉인벽·협동 중도 참가·전멸 초기화·단일 계정 세션·정상 사망 방식 재설정·모바일 월드 카메라 줌을 추가했습니다. 원인과 검증 결과는 `V4-UPDATE-REPORT-KR.md`에 있습니다.

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
- 계정마다 현재 세션 ID를 DB에 보관해 새 기기 로그인 시 이전 토큰과 소켓을 즉시 만료합니다.
- 보상·드랍·강화·상점 구매는 서버에서 처리합니다.
- 보스 AI·공격 판정·HP·페이즈·리스폰·기여자 보상은 서버 전투 인스턴스에서 처리합니다.
- 보스 HTTP 처치 보상 요청은 차단하며 실제 서버 보스전에 기여한 계정에만 보상을 한 번 지급합니다.
- 일반 저장 요청은 HP, 장착, 지역, 소비된 아이템만 반영하고 클라이언트가 골드·XP·장비를 임의로 늘리는 요청은 무시합니다.
- API 요청 속도 제한과 몬스터별 보상 재요청 제한이 있습니다.
- 비밀키와 DB 주소는 Git에 넣지 않고 Render 환경 변수로 관리합니다.

## 주의

Render 무료 Web Service는 한동안 접속이 없으면 잠들어 첫 접속 시 깨어나는 데 시간이 걸릴 수 있습니다. 무료 PostgreSQL은 생성 후 30일에 만료되므로, 장기간 실제 운영하려면 Render PostgreSQL을 `basic-256mb` 이상으로 바꾸세요.
