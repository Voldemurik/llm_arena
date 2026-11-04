#!/usr/bin/env python3
import argparse,hashlib,json,re
from pathlib import Path
SALT='arena-lab-2026-v1'
def topics(root):return json.loads((root/'course/topics.json').read_text(encoding='utf-8'))
def expected(username,root):
 username=username.strip().lower()
 if not re.fullmatch(r'[a-z0-9_.-]+',username):raise ValueError('Некорректный GitVerse login')
 ts=topics(root); idx=int.from_bytes(hashlib.sha256((SALT+':'+username).encode()).digest()[:8],'big')%len(ts)
 return {'schema_version':1,'author':username,'topic_id':ts[idx]['id']}
def render(v,root):
 t=next(t for t in topics(root) if t['id']==v['topic_id'])
 return f"# Вариант {t['id']}: {t['topic']}\n\n**Автор:** @{v['author']}\n\n**Раздел:** {t['category']}\n\n## Цель\n\n{t['goal']}\n\n## Обязательный интерактивный эффект\n\n{t['effect']}\n\n## Контрольный сценарий\n\nПокажите на собственных входных данных, что изменение параметра действительно приводит к ожидаемому эффекту. Укажите входные данные, действия и наблюдение в `research/comparison.md`.\n\nНе требуется внешнее API или обучение тяжёлой модели. Симуляции допустимы, если явно обозначены и отражают корректные правила.\n"
def generate(username,root):
 v=expected(username,root); p=root/'variant.json'
 if p.exists():
  current=json.loads(p.read_text(encoding='utf-8'))
  if current!=expected(current.get('author',''),root):raise ValueError('variant.json изменён')
  print('[OK] Вариант уже закреплён:',current['topic_id']);return
 p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (root/'VARIANT.md').write_text(render(v,root),encoding='utf-8')
 (root/'README.md').write_text(f'# Интерактивный учебный стенд\n\n- Автор: @{v["author"]}\n- Рецензент: @TODO\n- GitVerse Pages: TODO\n\n## О проекте\n\nTODO\n\n## Проверка\n\nTODO\n',encoding='utf-8')
 for name,head in [('short_prompt.md','Короткий промпт'),('detailed_prompt.md','Подробная инструкция'),('comparison.md','Сравнение попыток')]:
  p=root/'research'/name;p.parent.mkdir(parents=True,exist_ok=True)
  p.write_text('# '+head+'\n\nTODO\n',encoding='utf-8')
 for name in ['short_A','short_B','detailed_A','detailed_B']:
  p=root/'research/attempts'/name;p.mkdir(parents=True,exist_ok=True)
  (p/'RESULT.md').write_text(f'# Попытка {name}\n\n## Модель\n\nTODO\n\n## Ссылка на результат или файлы\n\nTODO\n\n## Наблюдения\n\nTODO\n',encoding='utf-8')
 print('[OK] Выдан вариант',v['topic_id'],'для @'+v['author'])
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--username',required=True);p.add_argument('--root',default='.');a=p.parse_args();generate(a.username,Path(a.root))
