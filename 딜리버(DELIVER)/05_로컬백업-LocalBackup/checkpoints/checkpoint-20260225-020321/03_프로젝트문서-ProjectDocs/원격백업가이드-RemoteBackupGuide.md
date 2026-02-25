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
./07_자동화스크립트-AutomationScripts/checkpoint.sh "단계 요약"
./07_자동화스크립트-AutomationScripts/checkpoint.sh "단계 요약" --push
./07_자동화스크립트-AutomationScripts/preview_paths.sh
./07_자동화스크립트-AutomationScripts/scheduled_backup_runner.sh
```

## 스케줄 등록 예시(WSL cron)
```bash
(crontab -l 2>/dev/null; echo "15 */6 * * * /mnt/c/Users/gusru/code/Openai-Codex/딜리버\\(DELIVER\\)/07_자동화스크립트-AutomationScripts/scheduled_backup_runner.sh --soft") | crontab -
```
