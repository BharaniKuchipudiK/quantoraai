import re

with open("src/components/AiStudio.jsx", "r") as f:
    content = f.read()

# We want to replace:
# {messages.slice(1).map(msg => (
# ... [until the end of that map block] ...
# ))}
# With:
# {renderedChatFeed}
# And inject `const renderedChatFeed = React.useMemo(() => { ... }` before `return (`

# Find the start of the map
start_idx = content.find("{messages.slice(1).map(msg => (")
if start_idx == -1:
    print("Could not find start")
    exit(1)

# Find the matching closing brace for the map
stack = 0
end_idx = -1
for i in range(start_idx, len(content)):
    if content[i] == '{':
        stack += 1
    elif content[i] == '}':
        stack -= 1
        if stack == 0:
            end_idx = i
            break

if end_idx == -1:
    print("Could not find end")
    exit(1)

map_block = content[start_idx+1 : end_idx] # remove the outer {}

# Find the main return (
return_idx = content.find("  return (", 700)
if return_idx == -1:
    print("Could not find return")
    exit(1)

# Inject the memo block
memo_code = f"""
  const renderedChatFeed = React.useMemo(() => {{
    return {map_block};
  }}, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, keyInputValue, arenaMode, secondModel]);
"""

new_content = content[:return_idx] + memo_code + content[return_idx:start_idx] + "{renderedChatFeed}" + content[end_idx+1:]

with open("src/components/AiStudio.jsx", "w") as f:
    f.write(new_content)

print("Successfully applied useMemo")
