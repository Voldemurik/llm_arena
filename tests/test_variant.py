import unittest,tempfile,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'course'))
from variant import expected,generate
class VariantTest(unittest.TestCase):
 def test_stable(self):
  root=Path(__file__).resolve().parents[1]
  self.assertEqual(expected('student_1',root),expected('STUDENT_1',root))
  self.assertEqual(len(json.loads((root/'course/topics.json').read_text())),24)
 def test_generate_idempotent(self):
  root=Path(__file__).resolve().parents[1]
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'course').mkdir();(p/'course/topics.json').write_bytes((root/'course/topics.json').read_bytes())
   generate('tester',p);v=(p/'variant.json').read_bytes();generate('tester',p)
   self.assertEqual(v,(p/'variant.json').read_bytes())
if __name__=='__main__':unittest.main()
