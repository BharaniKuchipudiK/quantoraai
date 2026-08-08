import sys

file_path = '/Users/bharanik/.gemini/antigravity/scratch/quantrora/src/components/AiStudio.jsx'

with open(file_path, 'r') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if 'const renderedChatFeed = React.useMemo(() => {' in line:
        start_idx = i
        break

if start_idx != -1:
    for i in range(start_idx, len(lines)):
        if '}, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, keyInputValue, arenaMode, secondModel]);' in lines[i]:
            end_idx = i
            break

if start_idx == -1 or end_idx == -1:
    print("Could not find renderedChatFeed block")
    sys.exit(1)

block = lines[start_idx:end_idx+1]
del lines[start_idx:end_idx+1]

insert_idx = -1
for i, line in enumerate(lines):
    if line.strip() == 'return (':
        insert_idx = i
        break

if insert_idx == -1:
    print("Could not find insert point")
    sys.exit(1)

lines = lines[:insert_idx] + block + lines[insert_idx:]

with open(file_path, 'w') as f:
    f.writelines(lines)

print("Success")
