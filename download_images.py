import urllib.request
import json
import os

def download_wiki_image(title, filename):
    url = f"https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles={title}&pithumbsize=1920&format=json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            pages = data['query']['pages']
            for page_id in pages:
                if 'thumbnail' in pages[page_id]:
                    img_url = pages[page_id]['thumbnail']['source']
                    print(f"Downloading {img_url} to {filename}")
                    req_img = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
                    with urllib.request.urlopen(req_img) as response_img, open(filename, 'wb') as out_file:
                        out_file.write(response_img.read())
                    return True
    except Exception as e:
        print(f"Error for {title}: {e}")
    return False

download_wiki_image("Times_Square", "public/hero_times_square.jpg")
download_wiki_image("Gardens_by_the_Bay", "public/hero_gardens.jpg")
