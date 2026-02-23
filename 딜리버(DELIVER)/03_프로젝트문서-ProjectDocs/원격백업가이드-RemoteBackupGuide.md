# 원격 백업 가이드 (Git Remote)

## 현재 연결
- remote 이름: `origin`
- 용도: 코드 백업 및 버전 관리

## 기본 명령
```bash
git add -A
git commit -m "chore: update"
git push origin main
```

## 자동화 스크립트 사용
```bash
cd /mnt/c/Users/gusru/code/Openai-Codex/딜리버\(DELIVER\)
./07_자동화스크립트-AutomationScripts/backup_and_push.sh
./07_자동화스크립트-AutomationScripts/backup_and_push.sh --push
```
