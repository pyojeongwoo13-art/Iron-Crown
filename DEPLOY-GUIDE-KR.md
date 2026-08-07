# IRON CROWN 배포 방법

## 1. GitHub 저장소 만들기

1. GitHub에서 새 저장소를 만들고 이름을 `iron-crown`으로 정합니다.
2. 이 ZIP의 압축을 푼 뒤 **안쪽의 모든 파일과 폴더**를 저장소 최상단에 올립니다.
3. 저장소의 `Settings → Pages → Build and deployment → Source`를 `GitHub Actions`로 바꿉니다.

## 2. Render 서버와 DB 만들기

1. Render에 GitHub 계정을 연결합니다.
2. Render 대시보드에서 `New → Blueprint`를 누릅니다.
3. 방금 만든 `iron-crown` 저장소를 선택합니다.
4. Render가 루트의 `render.yaml`을 읽으면 `iron-crown-server`와 `iron-crown-db`가 나타납니다.
5. `CLIENT_ORIGIN` 입력란에는 나중에 사용할 GitHub Pages 출처를 입력합니다.
   - 예: GitHub 아이디가 `pyojeongwoo13`이면 `https://pyojeongwoo13.github.io`
   - 주소 끝에 `/iron-crown`은 붙이지 않습니다.
6. Blueprint를 배포합니다.
7. 서버 배포가 끝나면 `https://iron-crown-server-xxxx.onrender.com` 형태의 주소를 복사합니다.

## 3. GitHub Pages가 Render 서버를 사용하게 연결하기

1. GitHub 저장소에서 `Settings → Secrets and variables → Actions → Variables`로 갑니다.
2. `New repository variable`을 누릅니다.
3. 이름은 `VITE_API_URL`, 값은 2단계에서 복사한 Render 서버 주소로 입력합니다. 주소 끝에는 `/`를 붙이지 않습니다.
4. 저장소의 `Actions` 탭에서 `Deploy IRON CROWN client to GitHub Pages`를 열고 `Run workflow`를 누릅니다.
5. 완료되면 `https://GitHub아이디.github.io/iron-crown/`에서 접속할 수 있습니다.

## 4. 접속 확인

1. 새 계정을 만들고 게임에 들어갑니다.
2. 몬스터 한 마리를 처치한 뒤 골드와 XP가 오르는지 확인합니다.
3. 상점 앞에서 포션을 구매하고, 대장간 앞에서 장비를 강화합니다.
4. 페이지를 새로고침해 진행 상황이 남는지 확인합니다.
5. 다른 브라우저나 기기에서 다른 계정으로 접속해 서로의 캐릭터가 보이는지 확인합니다.
6. 두 계정이 같은 지역 보스 투기장에 들어가 보스 위치·HP·페이즈와 공격 예고가 동일하게 보이는지 확인합니다.
7. 보스를 함께 처치한 뒤 두 계정 모두 XP와 확정 장비를 정확히 한 번만 받는지 확인합니다.

## 무료 Render 사용 시 꼭 알아둘 점

- 무료 서버는 15분 동안 요청이 없으면 잠들 수 있습니다. 다음 첫 접속은 서버가 깨어날 때까지 약 1분 정도 걸릴 수 있습니다.
- 무료 Render PostgreSQL은 30일 뒤 만료됩니다. 게임을 계속 운영하려면 만료 전에 DB를 유료 `basic-256mb` 이상으로 업그레이드해야 저장 데이터가 계속 유지됩니다.
- Render 서버 이름이 이미 사용 중이면 Render가 이름 뒤에 임의 문자를 붙입니다. 실제로 생성된 서버 주소를 GitHub의 `VITE_API_URL`에 넣어야 합니다.

## 업데이트 방법

파일을 수정해 GitHub `main` 브랜치에 올리면:

- GitHub Actions가 클라이언트를 다시 배포합니다.
- Render가 서버 변경을 감지해 자동으로 다시 배포합니다.
- PostgreSQL 저장 데이터는 그대로 유지됩니다.
