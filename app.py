import random
from flask import Flask, redirect, render_template, request, jsonify
from threading import Thread
import asyncio
import websockets
import json

app = Flask(__name__)

current_turtle = None
current_label = None

@app.route('/')
def control():
  # Load block stats
  try:
    with open('block_stats.json', 'r') as f:
      block_stats = json.load(f)
  except Exception:
    block_stats = {}
    
  turtles = {}
  try:
    with open('turtles.json', 'r') as f:
      turtles = json.load(f)
  except Exception:
    pass

  current_turtle_entry = None
  if current_label and str(current_label) in turtles:
    current_turtle_entry = turtles[str(current_label)]
  
  return render_template('control.html', turtles=clients, current_label=current_label, current_turtle=current_turtle_entry, block_stats=block_stats)

@app.route('/set_turtle', methods=['POST'])
def set_turtle():
  global current_turtle, current_label
  number = request.form.get('number')
  try:
    number_int = str(number)
  except (TypeError, ValueError):
    number_int = None
  if number_int in clients:
    current_turtle = clients[number_int]
    current_label = number_int
    # return jsonify({'success': True, 'current_label': current_label})
    return jsonify({'success': True, 'message': f'Turtle {number_int} set as current turtle.'}), 200
  # return jsonify({'success': False, 'error': 'Invalid turtle label'}), 400
  return jsonify({'success': False, 'message': 'Turtle not connected.'}), 400
  
@app.route('/move/<direction>', methods=['POST'])
def move(direction):
  if current_turtle and current_turtle.open:
    asyncio.run(current_turtle.send(json.dumps({"command": "move", "direction": direction})))
    return jsonify({"message": f"Moved {direction}"})
  return jsonify({"message": "No turtle connected."}), 400
  
@app.route('/turn/<direction>', methods=['POST'])
def turn(direction):
  if current_turtle and current_turtle.open:
    asyncio.run(current_turtle.send(json.dumps({"command": "turn", "direction": direction})))
    return jsonify({"message": f"Turned {direction}"})
  return jsonify({"message": "No turtle connected."}), 400
  
@app.route('/stop', methods=['POST'])
def stop():
  if current_turtle and current_turtle.open:
    asyncio.run(current_turtle.send(json.dumps({"command": "stop"})))
    return jsonify({"message": "Turtle stopped."})
  return jsonify({"message": "No turtle connected."}), 400

@app.route('/status', methods=['GET'])
def status():
  # Return current turtle and block stats for AJAX updates
  try:
    with open('block_stats.json', 'r') as f:
      block_stats = json.load(f)
  except Exception:
    block_stats = {}
  try:
    with open('turtles.json', 'r') as f:
      turtles = json.load(f)
  except Exception:
    turtles = {}
  current_turtle_entry = None
  if current_label and str(current_label) in turtles:
    current_turtle_entry = turtles[str(current_label)]
  return jsonify({
    "current_turtle": current_turtle_entry,
    "turtles": turtles,
    "block_stats": block_stats
  })

# --- WebSocket server for ComputerCraft ---
clients = {}

async def ws_handler(websocket, path):
    try:
        async for message in websocket:
          try:
            data = json.loads(message)
            if data.get("command") == "status":
              direction_addition = {"x": 0, "y": 0, "z": 0}
              if data.get("turtle_direction") == 1:
                direction_addition = {"x": 1, "y": 0, "z": 0}
              elif data.get("turtle_direction") == 2:
                direction_addition = {"x": 0, "y": 0, "z": 1}
              elif data.get("turtle_direction") == 3:
                direction_addition = {"x": -1, "y": 0, "z": 0}
              elif data.get("turtle_direction") == 4:
                direction_addition = {"x": 0, "y": 0, "z": -1}
              
              coords = tuple(data["turtle_position"][k] for k in ("x", "y", "z"))
              
              block_coords = tuple(data["turtle_position"][k] + direction_addition[k] for k in ("x", "y", "z"))
              
              coords_above = tuple(data["turtle_position"][k] + (1 if k == "y" else 0) for k in ("x", "y", "z"))
              coords_below = tuple(data["turtle_position"][k] + (-1 if k == "y" else 0) for k in ("x", "y", "z"))
              
              block_stats = {}
              try:
                with open("block_stats.json", "r") as f:
                  block_stats = json.load(f)
              except FileNotFoundError:
                pass
              block_stats[str(block_coords)] = data["block_forward"]
              block_stats[str(coords_below)] = data["block_below"]
              block_stats[str(coords_above)] = data["block_above"]
              
              if str(coords) in block_stats:
                block_stats.pop(str(coords))
                
              try:
                with open("turtles.json", "r") as f:
                  turtles = json.load(f)
              except FileNotFoundError:
                turtles = {}
                print("No turtles.json found, creating a new one.")

              label = data.get("turtle_label")
              if label is not None:
                turtles[str(label)] = {
                  "x": data["turtle_position"]["x"],
                  "y": data["turtle_position"]["y"],
                  "z": data["turtle_position"]["z"],
                  "direction": data.get("turtle_direction", 1)
                }
                with open("turtles.json", "w") as f:
                  json.dump(turtles, f)
              
              with open("block_stats.json", "w") as f:
                json.dump(block_stats, f)
                
            elif data.get("command") == "turtle_information":
              label = data.get("turtle_label")
              
              label = None if label == "None" else label
              
              if not label:
                label = random.randint(1000, 9999)
                
                try:
                  with open("turtles.json", "r") as f:
                    turtles = json.load(f)
                except FileNotFoundError:
                  turtles = {}

                turtles[str(label)] = {
                    "x": 0,
                    "y": 0,
                    "z": 0,
                    "direction": 1
                }

                with open("turtles.json", "w") as f:
                  json.dump(turtles, f)
                
                await websocket.send(json.dumps({"command": "init_label", "turtle_label": label}))
                
              try:
                with open("turtles.json", "r") as f:
                  turtles = json.load(f)
              except FileNotFoundError:
                turtles = {}

              if str(label) in turtles:
                clients[label] = websocket
                global current_turtle, current_label
                current_label = label
                current_turtle = websocket
                
                with open("turtles.json", "r") as f:
                  turtles = json.load(f)
                  
                await websocket.send(json.dumps({"command": "location_update", "turtle_position": {"x": turtles[str(label)]["x"],"y": turtles[str(label)]["y"],"z": turtles[str(label)]["z"]}, "turtle_direction": turtles[str(label)]["direction"]}))
              
          except Exception as e:
              print(f"Error processing message: {e}")
    finally:
        clients.remove(websocket)

def start_flask():
    app.run(debug=True, use_reloader=False)

if __name__ == '__main__':
    # Start Flask in a background thread
    flask_thread = Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # Run the WebSocket server in the main thread (required for Windows)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    ws_server = websockets.serve(ws_handler, '0.0.0.0', 8765)
    loop.run_until_complete(ws_server)
    loop.run_forever()
