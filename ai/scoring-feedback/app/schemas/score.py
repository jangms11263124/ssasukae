from pydantic import BaseModel, Field


class ScoreTestResponse(BaseModel):
    pitchScore: int = Field(..., ge=0, le=100)
    rhythmScore: int = Field(..., ge=0, le=100)
    lyricsScore: int = Field(..., ge=0, le=100)
    stabilityScore: int = Field(..., ge=0, le=100)
    finalScore: int = Field(..., ge=0, le=100)
    overall: str
    strength: str
    weakness: str
    tips: str
