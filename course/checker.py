#!/usr/bin/env python3
import json,re,sys,argparse
from pathlib import Path
from variant import expected,render

def meaningful(s,minchars):
 s=re.sub(r'(?m)^#{1,6} .*$', '',s)
 s=re.sub(r'(?i)\b(TODO|ЗАПОЛНИТЬ|PLACEHOLDER)\b','',s)
 return len(s.strip())>=minchars

def check(root):
 errors=[]
 def need(path,minchars=0):
  p=root/path
  if not p.is_file():errors.append(f'Нет файла: {path}');return ''
  s=p.read_text(encoding='utf-8',errors='replace')
  if minchars and not meaningful(s,minchars):errors.append(f'Не заполнен: {path} (минимум {minchars} символов текста)')
  return s
 try:
  v=json.loads(need('variant.json'))
  if v!=expected(v.get('author',''),root):errors.append('variant.json изменён или вариант неверен')
  if need('VARIANT.md')!=render(v,root):errors.append('VARIANT.md изменён')
 except (ValueError,KeyError,TypeError) as e:errors.append('Неверный вариант: '+str(e))
 readme=need('README.md',100)
 for label in ['Автор','Рецензент','GitVerse Pages']:
  if not re.search(r'(?im)^\s*[-*]?\s*'+re.escape(label)+r'\s*:',readme):errors.append('README: нет поля '+label)
 for p,n in [('research/short_prompt.md',40),('research/detailed_prompt.md',220),('research/comparison.md',220)]:need(p,n)
 for name in ['short_A','short_B','detailed_A','detailed_B']:
  folder='research/attempts/'+name
  meta=need(folder+'/RESULT.md',80)
  if not re.search(r'(?im)^##\s*Модель',meta) or not re.search(r'(?im)^##\s*Наблюдения',meta):errors.append(folder+': не хватает разделов')
  if not re.search(r'https?://',meta) and not any(p.is_file() and p.name!='RESULT.md' for p in (root/folder).rglob('*')):errors.append(folder+': нет ссылки на результат или исходных файлов')
 site=root/'site/index.html';html=need('site/index.html',120)
 if '<html' not in html.lower() or '<body' not in html.lower():errors.append('site/index.html: нет HTML-разметки')
 if re.search(r'(?:src|href)\s*=\s*["\']/[^/]',html,re.I):errors.append('site/index.html: абсолютные локальные пути могут ломать Pages')
 # Запретить публикацию исследовательских попыток из директории site.
 if (root/'site/research').exists() or (root/'site/attempts').exists():errors.append('Не публикуйте research/attempts внутри site/')
 return errors
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',default='.');a=p.parse_args()
 errors=check(Path(a.root));[print('[FAIL]',x) for x in errors];print('[RESULT]', 'PASS' if not errors else 'FAIL');sys.exit(bool(errors))
