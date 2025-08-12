
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const TodaysShipments: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [
    {
      name: "Shipment",
      data: [10, 31, 25, 40, 50, 50, 100],
    },
  ];

  const options: ApexOptions = {
    chart: {
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: false,
      },
    },
    colors: ["#5C61F2"],
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: "straight",
      width: 2,
    },
    grid: {
      show: true,
      strokeDashArray: 5,
      borderColor: "#EEF1FF",
    },
    xaxis: {
      categories: ["3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm", "12am"],
      axisTicks: {
        show: false,
        color: "#ECEEF2",
      },
      axisBorder: {
        show: false,
        color: "#ECEEF2",
      },
      labels: {
        show: true,
        style: {
          colors: "#64748B",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      tickAmount: 3,
      max: 150,
      min: 0,
      labels: {
        style: {
          colors: "#64748B",
          fontSize: "12px",
        },
      },
      axisBorder: {
        show: false,
        color: "#DDE4FF",
      },
      axisTicks: {
        show: false,
        color: "#DDE4FF",
      },
    },
    tooltip: {
      y: {
        formatter: (val) => {
          return val + " Ton";
        },
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] flex items-center justify-between">
          <div className="trezo-card-title">
            <span className="block mb-[4px]">Todays Shipments</span>
            <h5 className="!mb-0 md:!text-[20px]">9,120 Ton</h5>
          </div>
          <div className="trezo-card-subtitle">
            <span className="inline-block px-[8.5px] text-success-600 border border-success-300 bg-success-100 dark:bg-[#15203c] dark:border-[#15203c] rounded-[100px] text-xs">
              +5%
            </span>
          </div>
        </div>
        <div className="trezo-card-content">
          <div className="-mt-[26px] ltr:-ml-[15px] rtl:-mr-[15px] -mb-[29px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="line"
                height={187}
                width={"100%"}
              />
            ) : (
              <div>Loading chart...</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default TodaysShipments;
