/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import {GoogleGenAI, Modality} from '@google/genai';
import {
  Check,
  ChevronDown,
  Download,
  ImagePlus,
  LoaderCircle,
  Redo,
  SendHorizontal,
  Trash2,
  Undo,
  X,
} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

function parseError(error: string) {
  const regex = /{"error":(.*)}/gm;
  const m = regex.exec(error);
  try {
    const e = m[1];
    const err = JSON.parse(e);
    return err.message || error;
  } catch (e) {
    return error;
  }
}

/**
 * Formats a string with **-style bold markdown into JSX.
 * @param {string} text The text to format.
 * @returns {JSX.Element | null} The formatted text as a JSX element, or null.
 */
function formatPrompt(text: string) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </>
  );
}

type HistoryItem = {
  id: string;
  imageDataUrl: string;
  prompt: string;
  timestamp: Date;
};

type UploadedImage = {
  img: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
};

type InteractionState = {
  type: 'drag' | 'resize';
  handle?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
};

const HANDLE_SIZE = 10;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    'gemini-2.5-flash-image-preview',
  );
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(
    null,
  );
  const [interactionState, setInteractionState] =
    useState<InteractionState | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const updateHistory = useCallback(
    (newPrompt: string, newImageDataUrl: string) => {
      const newHistoryState: HistoryItem = {
        id: crypto.randomUUID(),
        imageDataUrl: newImageDataUrl,
        prompt: newPrompt,
        timestamp: new Date(),
      };
      const newHistory = [...history, newHistoryState];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history],
  );

  const getHandles = (image: UploadedImage) => {
    const {x, y, width, height} = image;
    const halfHandle = HANDLE_SIZE / 2;
    return {
      topLeft: {
        x: x - halfHandle,
        y: y - halfHandle,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      },
      topRight: {
        x: x + width - halfHandle,
        y: y - halfHandle,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      },
      bottomLeft: {
        x: x - halfHandle,
        y: y + height - halfHandle,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      },
      bottomRight: {
        x: x + width - halfHandle,
        y: y + height - halfHandle,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      },
    };
  };

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseImageDataUrl =
      history[historyIndex]?.imageDataUrl ||
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/epv2AAAAABJRU5ErkJggg==';

    const baseImage = new window.Image();
    baseImage.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

      if (uploadedImage) {
        ctx.drawImage(
          uploadedImage.img,
          uploadedImage.x,
          uploadedImage.y,
          uploadedImage.width,
          uploadedImage.height,
        );

        if (!isDrawing && !interactionState) {
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(
            uploadedImage.x,
            uploadedImage.y,
            uploadedImage.width,
            uploadedImage.height,
          );
          ctx.setLineDash([]);

          Object.values(getHandles(uploadedImage)).forEach((handle) => {
            ctx.fillStyle = '#007bff';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.fillRect(handle.x, handle.y, handle.width, handle.height);
            ctx.strokeRect(handle.x, handle.y, handle.width, handle.height);
          });
        }
      }
    };
    baseImage.src = baseImageDataUrl;
  }, [history, historyIndex, uploadedImage, isDrawing, interactionState]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const flattenImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!uploadedImage || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseImage = new window.Image();
    baseImage.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        uploadedImage.img,
        uploadedImage.x,
        uploadedImage.y,
        uploadedImage.width,
        uploadedImage.height,
      );

      updateHistory('Image placed', canvas.toDataURL('image/png'));
      setUploadedImage(null);
    };
    baseImage.src =
      history[historyIndex]?.imageDataUrl ||
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/epv2AAAAABJRU5ErkJggg==';
  }, [uploadedImage, history, historyIndex, updateHistory]);

  const processImageFile = useCallback(
    (file: File | null) => {
      if (!file) return;

      flattenImage();
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const maxW = canvas.width * 0.8;
          const maxH = canvas.height * 0.8;
          let width = img.width;
          let height = img.height;

          if (width > maxW) {
            height *= maxW / width;
            width = maxW;
          }
          if (height > maxH) {
            width *= maxH / height;
            height = maxH;
          }

          setUploadedImage({
            img,
            x: (canvas.width - width) / 2,
            y: (canvas.height - height) / 2,
            width,
            height,
            aspectRatio: img.width / img.height,
          });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [flattenImage],
  );

  const loadCanvasState = (imageDataUrl: string) => {
    setUploadedImage(null);
    flattenImage();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new window.Image();
    img.onload = () => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = imageDataUrl;
  };

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setTimeout(() => {
        const initialImageDataUrl = canvas.toDataURL('image/png');
        const initialState: HistoryItem = {
          id: crypto.randomUUID(),
          imageDataUrl: initialImageDataUrl,
          prompt: 'Initial canvas',
          timestamp: new Date(),
        };
        setHistory([initialState]);
        setHistoryIndex(0);
      }, 0);
    }
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            processImageFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [processImageFile]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return {x: 0, y: 0};
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.nativeEvent.touches
      ? e.nativeEvent.touches[0].clientX
      : e.nativeEvent.clientX;
    const clientY = e.nativeEvent.touches
      ? e.nativeEvent.touches[0].clientY
      : e.nativeEvent.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    flattenImage();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const {x, y} = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const {x, y} = getCoordinates(e);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = penColor;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    updateHistory('Drawing', canvasRef.current.toDataURL('image/png'));
  };

  const clearCanvas = () => {
    setUploadedImage(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateHistory('Canvas cleared', canvas.toDataURL('image/png'));
  };

  const handleUndo = () => {
    flattenImage();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      loadCanvasState(history[newIndex].imageDataUrl);
    }
  };

  const handleRedo = () => {
    flattenImage();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      loadCanvasState(history[newIndex].imageDataUrl);
    }
  };

  const handleRevertToHistory = (index: number) => {
    flattenImage();
    setHistoryIndex(index);
    loadCanvasState(history[index].imageDataUrl);
  };

  const handleColorChange = (e) => {
    setPenColor(e.target.value);
  };

  const openColorPicker = () => {
    colorInputRef.current?.click();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      openColorPicker();
    }
  };

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    const baseImage = new window.Image();
    baseImage.onload = () => {
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(baseImage, 0, 0, tempCanvas.width, tempCanvas.height);

      if (uploadedImage) {
        tempCtx.drawImage(
          uploadedImage.img,
          uploadedImage.x,
          uploadedImage.y,
          uploadedImage.width,
          uploadedImage.height,
        );
      }

      const link = document.createElement('a');
      link.download = 'gemini-codrawing.png';
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    };
    baseImage.src =
      history[historyIndex]?.imageDataUrl ||
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/epv2AAAAABJRU5ErkJggg==';
  }, [history, historyIndex, uploadedImage]);

  const updateCanvasWithImage = (imageUrl: string, promptToSave: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new window.Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      updateHistory(promptToSave, canvas.toDataURL('image/png'));
    };
    img.src = imageUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    flattenImage();
    if (!canvasRef.current) return;
    setIsLoading(true);
    const canvas = canvasRef.current;

    try {
      if (
        selectedModel === 'gemini-2.5-flash-image-preview' ||
        selectedModel === 'gemini-2.0-flash-preview-image-generation'
      ) {
        const drawingData = canvas.toDataURL('image/png').split(',')[1];

        const styleKeywords = [
          'style of',
          'watercolor',
          'photorealistic',
          'cartoon',
          'pixel art',
          'impressionist',
          'cubist',
          'surrealist',
          'sketch',
          'drawing',
          'minimalist',
          'comic book',
          'anime',
          'manga',
          '3d render',
          'low poly',
          'isometric',
          'steampunk',
          'cyberpunk',
          'vintage',
          'retro',
          'painting',
          'oil painting',
          'acrylic',
          'charcoal',
        ];

        const lowerCasePrompt = prompt.toLowerCase();
        const containsStyleKeyword = styleKeywords.some((keyword) =>
          lowerCasePrompt.includes(keyword),
        );

        const finalPrompt = containsStyleKeyword
          ? prompt
          : `${prompt}. Keep the same minimal line drawing style.`;

        const contents = {
          parts: [
            {inlineData: {data: drawingData, mimeType: 'image/png'}},
            {text: finalPrompt},
          ],
        };

        const response = await ai.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            responseModalities: [Modality.TEXT, Modality.IMAGE],
          },
        });

        const data = {
          success: true,
          message: '',
          imageData: null,
          error: undefined,
        };

        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            data.message = part.text;
          } else if (part.inlineData) {
            data.imageData = part.inlineData.data;
          }
        }

        if (data.imageData) {
          const imageUrl = `data:image/png;base64,${data.imageData}`;
          updateCanvasWithImage(imageUrl, prompt);
        } else {
          console.error('Failed to generate image:', data.error);
          alert('Failed to generate image. Please try again.');
        }
      } else if (selectedModel === 'imagen-4.0-generate-001') {
        const response = await ai.models.generateImages({
          model: selectedModel,
          prompt: prompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '16:9',
          },
        });
        const base64ImageBytes: string =
          response.generatedImages[0].image.imageBytes;
        const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
        updateCanvasWithImage(imageUrl, prompt);
      } else if (selectedModel === 'gemini-2.5-flash') {
        const drawingData = canvas.toDataURL('image/png').split(',')[1];
        const contents = {
          parts: [
            {inlineData: {data: drawingData, mimeType: 'image/png'}},
            {text: `Describe this image. ${prompt}`},
          ],
        };
        const response = await ai.models.generateContent({
          model: selectedModel,
          contents,
        });
        const description = response.text;
        updateHistory(description, canvas.toDataURL('image/png'));
        setPrompt('');
      }
    } catch (error) {
      console.error('Error submitting drawing:', error);
      setErrorMessage(error.message || 'An unexpected error occurred.');
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const closeErrorModal = () => {
    setShowErrorModal(false);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processImageFile(file);
    if (e.target) {
      e.target.value = ''; // Reset file input
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file);
    }
  };

  const handleCanvasMouseDown = (e) => {
    e.preventDefault();
    if (!uploadedImage) {
      startDrawing(e);
      return;
    }
    const coords = getCoordinates(e);

    const handles = getHandles(uploadedImage);
    for (const [key, handle] of Object.entries(handles)) {
      if (
        coords.x >= handle.x &&
        coords.x <= handle.x + handle.width &&
        coords.y >= handle.y &&
        coords.y <= handle.y + handle.height
      ) {
        setInteractionState({
          type: 'resize',
          handle: key as InteractionState['handle'],
          startX: coords.x,
          startY: coords.y,
          initialX: uploadedImage.x,
          initialY: uploadedImage.y,
          initialWidth: uploadedImage.width,
          initialHeight: uploadedImage.height,
        });
        return;
      }
    }

    if (
      coords.x >= uploadedImage.x &&
      coords.x <= uploadedImage.x + uploadedImage.width &&
      coords.y >= uploadedImage.y &&
      coords.y <= uploadedImage.y + uploadedImage.height
    ) {
      setInteractionState({
        type: 'drag',
        startX: coords.x,
        startY: coords.y,
        initialX: uploadedImage.x,
        initialY: uploadedImage.y,
        initialWidth: 0,
        initialHeight: 0,
      });
      return;
    }

    startDrawing(e);
  };

  const handleCanvasMouseMove = (e) => {
    e.preventDefault();
    if (interactionState && uploadedImage) {
      const coords = getCoordinates(e);
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (interactionState.type === 'drag') {
        const dx = coords.x - interactionState.startX;
        const dy = coords.y - interactionState.startY;
        let newX = interactionState.initialX + dx;
        let newY = interactionState.initialY + dy;

        newX = Math.max(0, Math.min(canvas.width - uploadedImage.width, newX));
        newY = Math.max(
          0,
          Math.min(canvas.height - uploadedImage.height, newY),
        );

        setUploadedImage({...uploadedImage, x: newX, y: newY});
      } else if (interactionState.type === 'resize') {
        const dx = coords.x - interactionState.startX;
        const dy = coords.y - interactionState.startY;
        let {initialX, initialY, initialWidth, initialHeight} =
          interactionState;
        let newX = initialX,
          newY = initialY,
          newW = initialWidth,
          newH = initialHeight;

        switch (interactionState.handle) {
          case 'bottomRight':
            newW = Math.max(HANDLE_SIZE * 2, initialWidth + dx);
            newH = newW / uploadedImage.aspectRatio;
            break;
          case 'bottomLeft':
            newW = Math.max(HANDLE_SIZE * 2, initialWidth - dx);
            newH = newW / uploadedImage.aspectRatio;
            newX = initialX + dx;
            break;
          case 'topLeft':
            newW = Math.max(HANDLE_SIZE * 2, initialWidth - dx);
            newH = newW / uploadedImage.aspectRatio;
            newX = initialX + dx;
            newY = initialY + dy;
            break;
          case 'topRight':
            newW = Math.max(HANDLE_SIZE * 2, initialWidth + dx);
            newH = newW / uploadedImage.aspectRatio;
            newY = initialY - (newH - initialHeight);
            break;
        }

        if (
          newX >= 0 &&
          newY >= 0 &&
          newX + newW <= canvas.width &&
          newY + newH <= canvas.height
        ) {
          setUploadedImage({
            ...uploadedImage,
            x: newX,
            y: newY,
            width: newW,
            height: newH,
          });
        }
      }
    } else {
      draw(e);
    }
  };

  const handleCanvasMouseUp = (e) => {
    e.preventDefault();
    if (interactionState) {
      setInteractionState(null);
    } else {
      stopDrawing();
    }
  };

  return (
    <>
      <div className="min-h-screen notebook-paper-bg text-gray-900 flex flex-col justify-start items-center">
        <main className="container mx-auto px-3 sm:px-6 py-5 sm:py-10 pb-32 max-w-7xl w-full flex flex-col lg:flex-row gap-8">
          <div className="flex-grow flex flex-col">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-2 sm:mb-6 gap-2">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-0 leading-tight font-mega">
                  Gemini Co-Drawing
                </h1>
                <p className="text-sm sm:text-base text-gray-500 mt-1">
                  Built with{' '}
                  <a
                    className="underline"
                    href="https://ai.google.dev/gemini-api/docs/image-generation"
                    target="_blank"
                    rel="noopener noreferrer">
                    Gemini native image generation
                  </a>
                </p>
                <p className="text-sm sm:text-base text-gray-500 mt-1">
                  by{' '}
                  <a
                    className="underline"
                    href="https://x.com/trudypainter"
                    target="_blank"
                    rel="noopener noreferrer">
                    @trudypainter
                  </a>{' '}
                  and{' '}
                  <a
                    className="underline"
                    href="https://x.com/alexanderchen"
                    target="_blank"
                    rel="noopener noreferrer">
                    @alexanderchen
                  </a>
                </p>
              </div>

              <menu className="flex items-center bg-gray-300 rounded-full p-2 shadow-sm self-start sm:self-auto">
                <div className="relative mr-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="h-10 rounded-full bg-white pl-3 pr-8 text-sm text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 appearance-none border-2 border-white"
                    aria-label="Select Gemini Model">
                    <option value="gemini-2.5-flash-image-preview">
                      2.5 Flash (Edit)
                    </option>
                    <option value="gemini-2.0-flash-preview-image-generation">
                      2.0 Flash (Edit)
                    </option>
                    <option value="imagen-4.0-generate-001">
                      Imagen 4 (Generate)
                    </option>
                    <option value="gemini-2.5-flash">
                      2.5 Flash (Describe)
                    </option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </div>
                <button
                  type="button"
                  className="w-10 h-10 rounded-full overflow-hidden mr-2 flex items-center justify-center border-2 border-white shadow-sm transition-transform hover:scale-110"
                  onClick={openColorPicker}
                  onKeyDown={handleKeyDown}
                  aria-label="Open color picker"
                  style={{backgroundColor: penColor}}>
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={penColor}
                    onChange={handleColorChange}
                    className="opacity-0 absolute w-px h-px"
                    aria-label="Select pen color"
                  />
                </button>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110 mr-2"
                  aria-label="Upload an image">
                  <ImagePlus className="w-5 h-5 text-gray-700" />
                </button>
                {uploadedImage && (
                  <button
                    type="button"
                    onClick={flattenImage}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-green-500 text-white shadow-sm transition-all hover:bg-green-600 hover:scale-110 mr-2"
                    aria-label="Place image on canvas">
                    <Check className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 mr-2">
                  <Undo className="w-5 h-5 text-gray-700" aria-label="Undo" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 mr-2">
                  <Redo className="w-5 h-5 text-gray-700" aria-label="Redo" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110 mr-2"
                  aria-label="Download image">
                  <Download className="w-5 h-5 text-gray-700" />
                </button>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110">
                  <Trash2
                    className="w-5 h-5 text-gray-700"
                    aria-label="Clear Canvas"
                  />
                </button>
              </menu>
            </div>

            <div className="w-full mb-6">
              <canvas
                ref={canvasRef}
                width={960}
                height={540}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                onTouchStart={handleCanvasMouseDown}
                onTouchMove={handleCanvasMouseMove}
                onTouchEnd={handleCanvasMouseUp}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 w-full hover:cursor-crosshair sm:h-[60vh] h-[30vh] min-h-[320px] bg-white/90 touch-none transition-all ${
                  isDraggingOver
                    ? 'border-blue-500 ring-4 ring-blue-300/50'
                    : 'border-black'
                }`}
              />
            </div>

            <form onSubmit={handleSubmit} className="w-full">
              <div className="relative">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Add your change..."
                  className="w-full p-3 sm:p-4 pr-12 sm:pr-14 text-sm sm:text-base border-2 border-black bg-white text-gray-800 shadow-sm focus:ring-2 focus:ring-gray-200 focus:outline-none transition-all font-mono"
                  required
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-none bg-black text-white hover:cursor-pointer hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                  {isLoading ? (
                    <LoaderCircle
                      className="w-5 sm:w-6 h-5 sm:h-6 animate-spin"
                      aria-label="Loading"
                    />
                  ) : (
                    <SendHorizontal
                      className="w-5 sm:w-6 h-5 sm:h-6"
                      aria-label="Submit"
                    />
                  )}
                </button>
              </div>
            </form>
          </div>

          <aside className="w-full lg:w-80 lg:max-h-[calc(60vh+120px)] flex-shrink-0 flex flex-col bg-white/80 border-2 border-black p-4">
            <h2 className="text-xl font-bold mb-4 font-mega text-center">
              History
            </h2>
            <ul className="overflow-y-auto space-y-3 pr-2 -mr-2">
              {history.map((item, index) => (
                <li
                  key={item.id}
                  className={`p-2 rounded-lg transition-colors ${
                    historyIndex === index
                      ? 'bg-blue-100 ring-2 ring-blue-400'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}>
                  <div className="flex items-start gap-3">
                    <img
                      src={item.imageDataUrl}
                      alt={item.prompt}
                      className="w-24 h-14 object-cover rounded border border-gray-300 flex-shrink-0 mt-1"
                    />
                    <div className="flex-grow">
                      <p className="text-sm font-semibold text-gray-800 break-words whitespace-pre-wrap">
                        {formatPrompt(item.prompt)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {item.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  {historyIndex !== index && (
                    <button
                      onClick={() => handleRevertToHistory(index)}
                      className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-800 mt-2 py-1 bg-white rounded-md border border-gray-300 hover:bg-gray-50 transition-colors">
                      Revert to this version
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        </main>
        {showErrorModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-700">
                  Failed to generate
                </h3>
                <button
                  onClick={closeErrorModal}
                  className="text-gray-400 hover:text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="font-medium text-gray-600">
                {parseError(errorMessage)}
              </p>
            </div>
          </div>
        )}
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        className="hidden"
        accept="image/*"
      />
    </>
  );
}
