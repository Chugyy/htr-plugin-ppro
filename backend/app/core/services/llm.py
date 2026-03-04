#!/usr/bin/env python3
# app/core/services/llm.py

import asyncio
from typing import Optional
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from config.config import settings


async def generate(prompt: str, system_prompt: Optional[str] = None) -> str:
    """
    Pure LLM text generation with fallback and retry.

    Primary: Anthropic Claude
    Fallback: OpenAI GPT

    Args:
        prompt: User prompt
        system_prompt: Optional system prompt

    Returns:
        Generated text

    Raises:
        RuntimeError: If both providers fail after retries
    """

    # Try Anthropic first
    for attempt in range(settings.llm_max_retries):
        try:
            if settings.anthropic_api_key:
                client = AsyncAnthropic(api_key=settings.anthropic_api_key)

                messages = [{"role": "user", "content": prompt}]

                response = await client.messages.create(
                    model=settings.llm_primary_model,
                    max_tokens=4096,
                    system=system_prompt if system_prompt else "",
                    messages=messages
                )

                return response.content[0].text
            else:
                break
        except Exception as e:
            wait_time = 2 ** attempt
            if attempt < settings.llm_max_retries - 1:
                await asyncio.sleep(wait_time)
            else:
                pass

    # Fallback to OpenAI
    for attempt in range(settings.llm_max_retries):
        try:
            if settings.openai_api_key:
                client = AsyncOpenAI(api_key=settings.openai_api_key)

                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})

                response = await client.chat.completions.create(
                    model=settings.llm_fallback_model,
                    messages=messages,
                    max_tokens=4096
                )

                return response.choices[0].message.content
            else:
                break
        except Exception as e:
            wait_time = 2 ** attempt
            if attempt < settings.llm_max_retries - 1:
                await asyncio.sleep(wait_time)

    raise RuntimeError(
        "LLM generation failed: Both Anthropic and OpenAI providers exhausted retries. "
        "Check API keys and network connectivity."
    )
