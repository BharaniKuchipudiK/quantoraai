export const prompt = `Build and test a small Python CSV-cleaning utility.

Create these actual files on the Coding Desk:
1. cleaner.py
2. test_cleaner.py
3. sample.csv
4. README.md

Use only Python's standard library, plus pytest for testing.
Read CSV columns name,email. Trim whitespace from names and emails. Lowercase emails.
Remove duplicate emails, keeping the first occurrence. Skip rows with an empty email.
Write the result to clean.csv.

Put this data in sample.csv:
name,email
 Alice , ALICE@example.com
Bob,bob@example.com
Alice Duplicate,alice@example.com
Missing,
Carol,carol@example.com

Add pytest tests for normalization, duplicates, empty emails, and CSV output.
Then:
1. Show the actual workspace file list.
2. Run pytest -q and show its actual output.
3. Run python3 cleaner.py sample.csv clean.csv.
4. Read clean.csv and show its actual contents.
5. Confirm it contains exactly three data rows: Alice, Bob, and Carol.

Do not substitute HTML or a browser preview for Python. Do not claim execution, passing tests, or saved output without evidence.`;

export const files = {
  'cleaner.py': `import csv
import sys

def clean(source, target):
    seen = set()
    with open(source, newline='') as inp, open(target, 'w', newline='') as out:
        writer = csv.DictWriter(out, fieldnames=['name', 'email'])
        writer.writeheader()
        for row in csv.DictReader(inp):
            email = row['email'].strip().lower()
            if email and email not in seen:
                seen.add(email)
                writer.writerow({'name': row['name'].strip(), 'email': email})

if __name__ == '__main__':
    clean(sys.argv[1], sys.argv[2])
`,
  'test_cleaner.py': `import csv
from cleaner import clean

def test_normalization_duplicates_and_empty(tmp_path):
    source, target = tmp_path/'in.csv', tmp_path/'out.csv'
    source.write_text('name,email\\n Alice , ALICE@example.com\\nOther,alice@example.com\\nMissing,\\n')
    clean(source, target)
    with open(target, newline='') as result:
        assert list(csv.DictReader(result)) == [{'name': 'Alice', 'email': 'alice@example.com'}]

def test_sample_output(tmp_path):
    target = tmp_path/'clean.csv'
    clean('sample.csv', target)
    with open(target, newline='') as result:
        rows = list(csv.DictReader(result))
    assert [row['name'] for row in rows] == ['Alice', 'Bob', 'Carol']
`,
  'sample.csv': 'name,email\n Alice , ALICE@example.com\nBob,bob@example.com\nAlice Duplicate,alice@example.com\nMissing,\nCarol,carol@example.com\n',
  'README.md': '# CSV cleaner\nRun `pytest -q` then `python3 cleaner.py sample.csv clean.csv`. Execution is verified by the desk, not claimed by this response.\n',
};
export const response = Object.entries(files).map(([path, content]) =>
  '```' + (path.endsWith('.py') ? 'python' : path.endsWith('.csv') ? 'csv' : 'markdown') + ` filepath="${path}"\n${content}\n` + '```',
).join('\n\n')
  // Evidence requested by the user is not another source file. This is the
  // exact production shape that previously tripped source-path-invalid.
  + '\n\n```text\n2 passed\n```\n\n```csv\nname,email\nAlice,alice@example.com\nBob,bob@example.com\nCarol,carol@example.com\n```';
