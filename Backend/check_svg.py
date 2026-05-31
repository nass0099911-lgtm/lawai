import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        match = re.search(r'<path d=\"([^\"]+)\"', line)
        if match and ('2 2' in match.group(1) or '2 0 0' in match.group(1)):
            print(f'Line {i+1}: {match.group(1)}')
