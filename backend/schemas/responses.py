from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from backend.schemas.requests import EnergyMix


class StateResponse(BaseModel):
    status: Literal["model_not_connected", "baseline_not_available", "validation_error", "prediction_error"]
    message: str


class CarbonForecastPoint(BaseModel):
    date: date
    predicted_price: float = Field(ge=0, allow_inf_nan=False)


class CarbonModelInfo(BaseModel):
    name: str = Field(min_length=1)
    rmse: float = Field(ge=0, allow_inf_nan=False)
    mape: float = Field(ge=0, allow_inf_nan=False)


class CarbonForecastSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["success"]
    market: str
    currency: str
    last_observed_date: date
    last_observed_price: float = Field(ge=0, allow_inf_nan=False)
    forecast: list[CarbonForecastPoint]
    model: CarbonModelInfo

    @model_validator(mode="after")
    def validate_forecast(self):
        dates = [point.date for point in self.forecast]
        if len(dates) != 30 or len(set(dates)) != 30 or dates != sorted(dates):
            raise ValueError("Forecast must contain 30 ordered, distinct trading days.")
        if any(day <= self.last_observed_date or day.weekday() >= 5 for day in dates):
            raise ValueError("Forecast dates must be future weekdays.")
        return self


class CO2ModelInfo(BaseModel):
    name: str = Field(min_length=1)
    r2: float = Field(allow_inf_nan=False)
    rmse: float = Field(ge=0, allow_inf_nan=False)
    features: list[str] | None = None
    train_period: str | None = None
    test_methodology: str | None = None


class CO2PredictionSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["success"]
    co2_per_capita_t: float = Field(ge=0, allow_inf_nan=False)
    model: CO2ModelInfo
    yearly_forecast: list["AnnualCO2Prediction"] | None = None

    @model_validator(mode="after")
    def validate_annual_forecast(self):
        if self.yearly_forecast is not None:
            years = [point.year for point in self.yearly_forecast]
            if years != [2027, 2028, 2029, 2030] or abs(self.yearly_forecast[-1].co2_per_capita_t - self.co2_per_capita_t) > 1e-6:
                raise ValueError("Annual prediction must cover 2027–2030 and match its 2030 endpoint.")
        return self


class ScenarioValue(BaseModel):
    label: str
    energy_mix: EnergyMix
    co2_per_capita_t: float = Field(ge=0, allow_inf_nan=False)
    yearly_forecast: list["AnnualCO2Prediction"] | None = None

    @model_validator(mode="after")
    def validate_annual_forecast(self):
        if self.yearly_forecast is not None:
            years = [point.year for point in self.yearly_forecast]
            if years != [2027, 2028, 2029, 2030]:
                raise ValueError("Annual forecast must cover 2027 through 2030 in order.")
            if abs(self.yearly_forecast[-1].co2_per_capita_t - self.co2_per_capita_t) > 1e-6:
                raise ValueError("The 2030 annual forecast must match the 2030 endpoint.")
        return self


class AnnualCO2Prediction(BaseModel):
    year: Literal[2027, 2028, 2029, 2030]
    co2_per_capita_t: float = Field(ge=0, allow_inf_nan=False)
    co2_emissions_mt: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class ComparisonResult(BaseModel):
    baseline: float
    scenario: float
    difference: float
    reduction: float
    reduction_percent: float
    direction: Literal["increase", "decrease", "unchanged"]


class ScenarioComparisonSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["success"]
    country: str
    target_year: Literal[2030]
    baseline: ScenarioValue
    user_scenario: ScenarioValue
    comparison: ComparisonResult
    model: CO2ModelInfo
