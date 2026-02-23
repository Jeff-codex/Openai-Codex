# 딜리버 웹서비스 개발 저장 구조 (Local + Git Remote)

## 저장 경로
- 로컬 PC: `C:\Users\gusru\code\Openai-Codex`
- WSL 경로: `/mnt/c/Users/gusru/code/Openai-Codex`
- 원격 Git: `origin` (현재 연결됨)

## 폴더 구조 (한국어+영어)
- `01_서비스코드-ServiceCode` : 실제 개발 소스
- `02_디자인에셋-DesignAssets` : 로고/이미지/브랜드 리소스
- `03_프로젝트문서-ProjectDocs` : 요구사항/운영 문서
- `04_배포패키지-DeployPackage` : 배포 산출물
- `05_로컬백업-LocalBackup` : 로컬 백업 압축본
- `06_운영로그-OpsLogs` : 운영 로그 파일
- `07_자동화스크립트-AutomationScripts` : 백업/동기화 스크립트

## 현재 랜딩페이지 위치
- `01_서비스코드-ServiceCode/랜딩페이지-LandingPage/index.html`

루트 `index.html`은 위 경로로 자동 이동하도록 구성되어 있습니다.

## 운영 안정화 워크플로우
1. 개발 후 로컬 백업 생성
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex
./07_자동화스크립트-AutomationScripts/backup_and_push.sh
```

2. 백업 + Git 원격 푸시까지 한 번에 실행
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex
./07_자동화스크립트-AutomationScripts/backup_and_push.sh --push
```
