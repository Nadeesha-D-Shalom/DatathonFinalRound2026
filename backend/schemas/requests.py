from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class EnergyMix(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    coal_pct: float = Field(ge=0, le=100)
    oil_pct: float = Field(ge=0, le=100)
    gas_pct: float = Field(ge=0, le=100)
    nuclear_pct: float = Field(ge=0, le=100)
    hydro_pct: float = Field(ge=0, le=100)
    solar_pct: float = Field(ge=0, le=100)
    wind_pct: float = Field(ge=0, le=100)
    other_renewables_pct: float = Field(ge=0, le=100)

    @model_validator(mode="after")
    def validate_total(self):
        if abs(sum(self.model_dump().values()) - 100.0) > 0.5:
            raise ValueError("Energy mix percentages must total approximately 100%.")
        return self


class CarbonForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    market: str = Field(min_length=1)


class CO2PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    energy_mix: EnergyMix


class ScenarioComparisonRequest(CO2PredictionRequest):
    country: str = Field(min_length=1)
    target_year: Literal[2027, 2028, 2029, 2030] = 2030

    @field_validator("target_year", mode="before")
    @classmethod
    def require_integer_year(cls, value):
        if type(value) is not int:
            raise ValueError("Forecast year must be an integer from 2027 through 2030.")
        return value
