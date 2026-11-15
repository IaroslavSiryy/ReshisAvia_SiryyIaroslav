import os, sqlite3, hashlib, jwt, datetime, pandas as pd, uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

app = FastAPI(title="Решись Авиа2")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"])

SECRET_KEY = "super_secret_reshys_key_2026_this_is_long_enough_for_sha256"
ALGORITHM = "HS256"
security = HTTPBearer()

# 20 кодов сотрудников
EMPLOYEE_CODES = [
    "RESHYS-2026", "AVIA-777", "PILOT-101", "CREW-202", "SALES-303",
    "ANALYST-404", "BOSS-999", "INTERN-001", "FLY-550", "JET-881",
    "MOW-123", "AER-456", "LED-789", "SUPPORT-112", "ADMIN-911",
    "TECH-007", "HR-234", "FIN-567", "LEGAL-890", "MEDIA-321"
]

#База данных
def init_db():
    with sqlite3.connect("users.db") as conn:
        cursor = conn.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        if not columns or "emp_code" not in columns:
            conn.execute("DROP TABLE IF EXISTS users")
            conn.execute(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, emp_code TEXT)")
init_db()

def hash_password(p: str) -> str:
    return hashlib.sha256(p.encode()).hexdigest()

# Модели данных
class RegReq(BaseModel):
    username: str
    password: str
    employee_code: str

class LogReq(BaseModel):
    username: str
    password: str

class FcReq(BaseModel):
    origin: str
    destination: str
    date: str
    price: float

class OptReq(BaseModel):
    origin: str
    destination: str
    date: str

@app.post("/api/auth/register")
def register(req: RegReq):
    #Проверка подлиности кода
    if req.employee_code not in EMPLOYEE_CODES:
        raise HTTPException(400, "Неверный код сотрудника")
    with sqlite3.connect("users.db") as conn:
        #Не использовался ли этот код кем-то ранее
        row = conn.execute("SELECT id FROM users WHERE emp_code = ?", (req.employee_code,)).fetchone()
        if row:
            raise HTTPException(400, "Этот код сотрудника уже был использован")
        try:
            conn.execute("INSERT INTO users (username, password, emp_code) VALUES (?, ?, ?)",
                         (req.username, hash_password(req.password), req.employee_code))
        except sqlite3.IntegrityError:
            raise HTTPException(400, "Логин уже существует")
    return {"ok": True}

@app.post("/api/auth/login")
def login(req: LogReq):
    with sqlite3.connect("users.db") as conn:
        row = conn.execute("SELECT password FROM users WHERE username = ?", (req.username,)).fetchone()
    if not row or row[0] != hash_password(req.password):
        raise HTTPException(401, "Неверный логин или пароль")
    expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=120)
    token = jwt.encode({"sub": req.username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
    return {"access_token": token}

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except:
        raise HTTPException(401, "Ошибка токена")
#Извлечение данных
base_dir = os.path.dirname(__file__)
df_fc = pd.read_csv(os.path.join(base_dir, "data", "СирыйЯрославДмитриевич_my_forecast.csv"))
df_rt = pd.read_csv(os.path.join(base_dir, "data", "routes.csv"))
df_fc["date"] = pd.to_datetime(df_fc["date"]).dt.strftime("%Y-%m-%d")

# Динамический словарь: Название города -> Код маршрута (MOW-XXX)
CITY_TO_ROUTE = {}
for _, row in df_rt.iterrows():
    route_code = str(row["route"])
    full_name = str(row["name"])
    if route_code.startswith("MOW-"):
        if "—" in full_name:
            dest_name = full_name.split("—")[1].strip()
        elif "-" in full_name:
            dest_name = full_name.split("-")[1].strip()
        else:
            dest_name = full_name.strip()
        CITY_TO_ROUTE[dest_name] = route_code

#эндпоинты апи
@app.get("/api/cities")
def get_cities():
    return list(CITY_TO_ROUTE.keys())

@app.get("/api/dates/{destination}")
def get_dates(destination: str):
    route = CITY_TO_ROUTE.get(destination)
    if not route: raise HTTPException(404, "Город не найден")

    dates = df_fc[df_fc["route"] == route]["date"].unique().tolist()
    valid_dates = [d for d in dates if "2026-06-01" <= d <= "2026-07-01"]
    return sorted(valid_dates)

@app.post("/api/forecast")
def get_forecast(req: FcReq):
    if req.origin != "Москва": raise HTTPException(400, "Вылет только из Москвы")
    if req.date < "2026-06-01" or req.date > "2026-07-01": raise HTTPException(400, "Неверная дата")
    route = CITY_TO_ROUTE.get(req.destination)
    if not route: raise HTTPException(404, "Маршрут не найден")
    rt_row = df_rt[df_rt["route"] == route]
    fc_row = df_fc[(df_fc["route"] == route) & (df_fc["date"] == req.date)]
    if rt_row.empty or fc_row.empty: raise HTTPException(404, "На эту дату нет рейса")
    rt_info, fc_info = rt_row.iloc[0], fc_row.iloc[0]
    seats = int(fc_info["seats"])
    bp = float(rt_info["base_price"])
    ps = float(rt_info["price_sensitivity"])
    cost_per_pass = float(rt_info["cost_per_passenger"])
    # Медиана
    base_demand = float(fc_info["0.5_base_demand"])
    want = max(0, base_demand - ps * (req.price - bp))
    will_buy = int(min(seats, round(want)))
    profit = will_buy * (req.price - cost_per_pass)
    # Квантили и прибыль по каждому
    quantiles = {}
    for q in ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9"]:
        bd = float(fc_info[f"{q}_base_demand"])
        w = max(0, bd - ps * (req.price - bp))
        buy_q = int(min(seats, round(w)))
        profit_q = buy_q * (req.price - cost_per_pass)
        quantiles[q] = {"base_demand": round(bd), "want": round(w, 1), "buy": buy_q, "profit": round(profit_q)}
    return {
        "route_name": str(rt_info["name"]), "date": req.date,
        "seats": seats, "input_price": req.price, "want_to_buy": round(want),
        "will_buy": will_buy, "profit": round(profit), "quantiles": quantiles
    }

@app.post("/api/optimal_price")
def get_optimal_price(req: OptReq):
    route = CITY_TO_ROUTE.get(req.destination)
    if not route: raise HTTPException(404, "Маршрут не найден")
    rt_info = df_rt[df_rt["route"] == route].iloc[0]
    fc_info = df_fc[(df_fc["route"] == route) & (df_fc["date"] == req.date)].iloc[0]
    seats = int(fc_info["seats"])
    bp = float(rt_info["base_price"])
    ps = float(rt_info["price_sensitivity"])
    cost = float(rt_info["cost_per_passenger"])
    best_price, max_avg_profit = bp, -999999999
    for test_price in range(1000, 20000, 100):
        total_profit = 0
        for q in ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9"]:
            bd = float(fc_info[f"{q}_base_demand"])
            w = max(0, bd - ps * (test_price - bp))
            buy_q = int(min(seats, round(w)))
            total_profit += buy_q * (test_price - cost)
        avg_profit = total_profit / 9
        if avg_profit > max_avg_profit:
            max_avg_profit = avg_profit
            best_price = test_price
    return {"optimal_price": best_price, "expected_profit": round(max_avg_profit)}


# Раздача статики
app.mount("/", StaticFiles(directory=os.path.join(base_dir, "static"), html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
