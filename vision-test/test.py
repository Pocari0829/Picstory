import base64
import os
import requests
from dotenv import load_dotenv

load_dotenv()

vision_api_key = os.getenv("GOOGLE_VISION_API_KEY")
places_api_key = os.getenv("GOOGLE_PLACES_API_KEY")

IMAGE_PATH = "test2.webp"

with open(IMAGE_PATH, "rb") as image_file:
    image_content = base64.b64encode(image_file.read()).decode("utf-8")

vision_url = f"https://vision.googleapis.com/v1/images:annotate?key={vision_api_key}"

vision_data = {
    "requests": [
        {
            "image": {
                "content": image_content
            },
            "features": [
                {
                    "type": "WEB_DETECTION",
                    "maxResults": 10
                },
                {
                    "type": "LANDMARK_DETECTION",
                    "maxResults": 5
                }
            ]
        }
    ]
}

vision_response = requests.post(
    vision_url,
    json=vision_data
)

if vision_response.status_code != 200:
    print("Vision API 요청 실패")
    print(vision_response.status_code)
    print(vision_response.text)
    exit()

vision_result = vision_response.json()["responses"][0]

web_detection = vision_result.get("webDetection", {})
web_entities = web_detection.get("webEntities", [])

landmarks = vision_result.get("landmarkAnnotations", [])


print("=" * 50)
print("WEB DETECTION")
print("=" * 50)

for entity in web_entities:
    name = entity.get("description")
    score = entity.get("score")

    if name:
        print("이름:", name)
        print("점수:", round(score, 4) if score is not None else "없음")
        print("-" * 30)


print()
print("=" * 50)
print("LANDMARK DETECTION")
print("=" * 50)

for landmark in landmarks:
    name = landmark.get("description")
    score = landmark.get("score")

    print("이름:", name)
    print("신뢰도:", round(score, 4) if score is not None else "없음")

    for location in landmark.get("locations", []):
        lat_lng = location.get("latLng", {})

        print("위도:", lat_lng.get("latitude"))
        print("경도:", lat_lng.get("longitude"))

    print("-" * 30)


place_candidates = []

for entity in web_entities:
    name = entity.get("description")
    score = entity.get("score", 0)

    if name:
        place_candidates.append({
            "name": name,
            "source": "WEB",
            "score": score
        })

for landmark in landmarks:
    name = landmark.get("description")
    score = landmark.get("score", 0)

    if name:
        place_candidates.append({
            "name": name,
            "source": "LANDMARK",
            "score": score
        })


print()
print("=" * 50)
print("장소 후보")
print("=" * 50)

for candidate in place_candidates[:10]:
    print(
        f"{candidate['name']} "
        f"[{candidate['source']}] "
        f"{candidate['score']:.4f}"
    )


if not place_candidates:
    print("장소 후보를 찾지 못했습니다.")
    exit()


web_candidates = [
    candidate
    for candidate in place_candidates
    if candidate["source"] == "WEB"
]

landmark_candidates = [
    candidate
    for candidate in place_candidates
    if candidate["source"] == "LANDMARK"
]


if web_candidates:
    best_candidate = web_candidates[0]
else:
    best_candidate = landmark_candidates[0]


print()
print("=" * 50)
print("선택된 장소 후보")
print("=" * 50)

print("이름:", best_candidate["name"])
print("출처:", best_candidate["source"])
print("Vision 점수:", round(best_candidate["score"], 4))


print()
print("=" * 50)
print("PLACES API")
print("=" * 50)

places_url = "https://places.googleapis.com/v1/places:searchText"

places_data = {
    "textQuery": best_candidate["name"]
}

headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": places_api_key,
    "X-Goog-FieldMask": (
        "places.id,"
        "places.displayName,"
        "places.formattedAddress,"
        "places.location,"
        "places.googleMapsUri"
    )
}

places_response = requests.post(
    places_url,
    json=places_data,
    headers=headers
)

if places_response.status_code != 200:
    print("Places API 요청 실패")
    print(places_response.status_code)
    print(places_response.text)
    exit()

places_result = places_response.json()

places = places_result.get("places", [])

if not places:
    print("장소를 찾지 못했습니다.")
    exit()


place = places[0]

place_id = place.get("id")
place_name = place.get("displayName", {}).get("text")
place_address = place.get("formattedAddress")
place_location = place.get("location", {})
place_latitude = place_location.get("latitude")
place_longitude = place_location.get("longitude")
place_maps_url = place.get("googleMapsUri")


print()
print("=" * 50)
print("최종 장소 정보")
print("=" * 50)

print("이름:", place_name)
print("주소:", place_address)
print("위도:", place_latitude)
print("경도:", place_longitude)
print("Place ID:", place_id)
print("Google Maps:", place_maps_url)

print("=" * 50)