# IRON CROWN v5 수정 업데이트 보고서

## 카메라 최종 로직

`client/src/game/network.ts`의 최종 분기는 다음과 같습니다.

```ts
export function cameraZoomFor(width: number, height: number, coarsePointer: boolean) {
  if (height <= 500 && width <= 1000) return .55;
  if (coarsePointer) return .8;
  return 1;
}
```

- 가로 휴대폰: 높이 500px 이하이면서 폭 1000px 이하 → 0.55
- 태블릿 등 그 밖의 coarse pointer 기기 → 0.80
- PC → 1.00

844×390에서는 `viewWidth = 844 ÷ 0.55 = 1,534.55`, `viewHeight = 390 ÷ 0.55 = 709.09` world px입니다. 월드 canvas에만 scale을 적용하고 React DOM HUD와 조작 버튼은 transform 밖에 유지했습니다. 카메라 clamp, culling, 포인터 역변환은 모두 viewport를 zoom으로 나눈 월드 크기를 사용합니다.

## 서버 권위 장비 삭제

API는 `POST /api/game/delete-item`이며 JSON 본문으로 `{ "itemId": "..." }`를 받습니다.

1. 최신 active session을 HTTP 인증 단계에서 확인합니다.
2. DB 저장 행을 `FOR UPDATE`로 잠급니다.
3. itemId가 해당 계정 인벤토리에 실제로 존재하는지 확인합니다.
4. 마지막 남은 무기인지 확인합니다.
5. 현재 장착 중인지 확인합니다.
6. 검증을 통과한 정확한 ID 하나만 제거하고 전체 save를 DB에 기록합니다.
7. 갱신된 save와 삭제된 장비의 ID·이름을 반환합니다.

존재하지 않거나 이미 삭제된 ID, 다른 계정의 장비 ID, 장착 중 장비, 마지막 무기는 409로 거절됩니다. 트랜잭션 잠금 때문에 빠른 중복 요청도 첫 요청만 성공하고 다음 요청은 존재하지 않는 장비로 거절됩니다. 삭제 시 골드·XP·재료 보상은 없습니다.

## 게임 내부 확인 모달

`GameConfirmModal` 하나를 아이템 삭제와 캐릭터 재설정이 함께 사용합니다.

- 반투명 검정 backdrop, 짙은 녹색 패널, 금색 테두리
- 장비 아이콘·이름·강화 단계·등급 표시
- 전설, +10 이상, +20 이상에 맞는 추가 경고
- 취소/삭제 또는 취소/재설정 버튼
- 요청 처리 중 두 버튼 비활성화
- ESC 취소
- backdrop 클릭으로 위험 작업 실행 또는 확인 처리 없음
- 모달이 최상위 z-index로 뒤 UI 입력 차단
- 낮은 가로 화면용 별도 압축 레이아웃

장착 중인 장비와 마지막 무기는 확인 모달을 열기 전 게임 toast로 이유를 알리고, 서버에서도 같은 규칙을 다시 검사합니다. 재설정 확인 후에는 v4의 기존 사망·2.4초 부활·보스 참가 이탈 경로를 그대로 호출합니다. 브라우저 `confirm()`과 `alert()`는 사용하지 않습니다.

## 변경 파일

- `client/src/game/network.ts`
- `client/src/components/IronCrownGame.tsx`
- `client/src/game.css`
- `server/src/game.ts`
- `server/src/index.ts`
- `tests/network-auth-optimization.test.mjs`
- `tests/server-authority.test.mjs`
- `tests/live-api-check.mjs`
- `README.md`, package version 파일, 이 보고서

## 자동 검증 항목

- 740×360, 800×360, 844×390, 915×412 → 0.55
- coarse pointer 1024×768, 1280×800 → 0.80
- PC 1366×768, 1920×1080 → 1.00
- 일반·전설·+20 장비 삭제
- 장착 장비·마지막 무기·없는 ID 거절
- 다른 계정의 장비 ID 거절
- 중복 삭제 요청 안전 처리
- 삭제 직후 DB 저장과 재로그인 후 미복원 확인
- 브라우저 confirm/alert 미사용과 공통 모달 구조 확인
- v4 보스 타임라인·협동·전멸·세션·네트워크 테스트 회귀 확인

## Clean build 결과

기존 `node_modules`, `dist`, `tsconfig.tsbuildinfo`를 제외한 새 임시 복사본에서 다음 순서로 실행했습니다.

1. `npm ci --prefix client` — 성공, 35 packages
2. `npm ci --prefix server` — 성공, 163 packages
3. GitHub Pages 환경변수를 적용한 client production build — 성공
4. server TypeScript production build — 성공
5. 자동 테스트 — 28/28 통과
6. 메모리 PostgreSQL + HTTP + Socket.IO 통합 테스트 — 통과

첫 진단에서는 `VITE_BASE_PATH` 없이 client를 빌드해 기능 테스트 27개는 통과했지만 GitHub Pages 경로 검사 1개가 실패했습니다. 이는 코드 실패가 아니라 배포 환경변수 누락으로 확인했으며, 최종 clean run은 실제 배포 값 `VITE_BASE_PATH=/iron-crown/`을 적용해 28개 전부 통과했습니다.

통합 테스트에서는 두 계정 협동 보스 보상, 장비 삭제 성공, 장착 장비·다른 계정 ID·중복 삭제 거절, DB 저장, 재로그인 후 삭제 상태 유지, 새 로그인에 의한 이전 세션 종료까지 확인했습니다. v4 네트워크 값인 플레이어 15Hz, world 15Hz, 보스 판정 20Hz, 보스 snapshot 12Hz도 그대로였습니다.

현재 실행 환경에는 Android Chrome 브라우저와 실제 터치 디스플레이가 없으므로 844×390 실기기 픽셀 스크린샷은 만들지 않았습니다. 대신 같은 viewport 입력에서 camera zoom 0.55와 1,534.55×709.09 world viewport 계산을 자동 테스트로 고정했습니다.

## 변경하지 않은 것

보스 HP·공격력·패턴·XP·드랍률, 일반 몬스터, 지역, 레벨, 강화 확률·비용, 포션, 대쉬·방어·무기 스킬, 온라인 네트워크 빈도와 저장 데이터 형식은 변경하지 않았습니다.
