from pathlib import Path
import base64
import hashlib

FILES = [
    'api/_lib/chat-handler.ts',
    'api/_lib/transaction-trace.test.ts',
    'src/hooks/useChatStream.js',
    'src/lib/execution-spine-recovery-wiring.test.js',
]
CHUNK = 6000

for path in FILES:
    data = Path(path).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    encoded = base64.b64encode(data).decode('ascii')
    total = (len(encoded) + CHUNK - 1) // CHUNK
    print(f'RELIABILITY_BLOB_BEGIN|{path}|{digest}|{len(data)}|{total}')
    for index in range(total):
        chunk = encoded[index * CHUNK:(index + 1) * CHUNK]
        print(f'RELIABILITY_BLOB|{path}|{index + 1}|{total}|{chunk}')
    print(f'RELIABILITY_BLOB_END|{path}|{digest}')
